"use server";

import { scheduleWebhookDispatch } from "@/lib/webhooks/schedule";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, assertTenantScoping } from "@/lib/data/tenant";
import {
  canTransitionTicket,
  canEditTicket,
  canReassignTicket,
  buildTicketDiffActivities,
  buildTicketCreatedActivity,
  buildTicketStatusChangedActivity,
} from "@/lib/tickets/lifecycle";
import {
  computeTicketSLADeadlines,
  evaluateStatusTransitionSLA,
  recalculateTicketSLA,
} from "#sla/ticket-sla";
import type { Ticket, TicketStatus, TicketPriority } from "@/types/database";

export interface TicketActionState {
  error?: string | null;
  success?: string | null;
  ticketId?: string;
  ticket?: Ticket;
}

const VALID_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];
const VALID_PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

/**
 * Creates a ticket within an organization.
 * Caller must be an authenticated member of the organization.
 */
interface ValidatedTicketData {
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
}

async function validateTicketInput(
  formData: FormData,
  orgId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ data?: ValidatedTicketData; error?: string }> {
  const title = formData.get("title")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const status = (formData.get("status")?.toString().trim() ??
    "open") as TicketStatus;
  const priority = (formData.get("priority")?.toString().trim() ??
    "medium") as TicketPriority;
  const rawAssignedTo = formData.get("assigned_to")?.toString().trim() ?? "";
  const assigned_to = rawAssignedTo === "" ? null : rawAssignedTo;

  if (!title || title.length < 1 || title.length > 200) {
    return { error: "Ticket title must be between 1 and 200 characters." };
  }

  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status." };
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    return { error: "Invalid priority." };
  }

  if (assigned_to) {
    const { data: isMember } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", assigned_to)
      .maybeSingle();

    if (!isMember) {
      return {
        error: "The selected assignee is not a member of this organization.",
      };
    }
  }

  return {
    data: {
      title,
      description: description || null,
      status,
      priority,
      assigned_to,
    },
  };
}

export async function createTicketAction(
  orgId: string,
  orgSlug: string,
  prevState: TicketActionState | null,
  formData: FormData,
): Promise<TicketActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  const supabase = await createClient();
  const user = context.user;

  if (!user) {
    return { error: "You must be signed in to create a ticket." };
  }

  const validation = await validateTicketInput(formData, orgId, supabase);
  if (validation.error || !validation.data) {
    return { error: validation.error || "Invalid ticket data." };
  }

  // Load organization SLA policy (falls back gracefully if not configured)
  const { data: slaPolicy, error: policyError } = await supabase
    .from("organization_sla_policies")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (policyError) return { error: "Unable to load SLA policy." };

  const slaDeadlines = slaPolicy
    ? computeTicketSLADeadlines(new Date(), validation.data.priority, slaPolicy)
    : null;

  const { data: newTicket, error } = await supabase
    .from("tickets")
    .insert({
      organization_id: orgId,
      title: validation.data.title,
      description: validation.data.description,
      status: validation.data.status,
      priority: validation.data.priority,
      created_by: user.id,
      assigned_to: validation.data.assigned_to,
      ...(validation.data.status !== "open" && {
        first_responded_at: new Date().toISOString(),
      }),
      ...(["resolved", "closed"].includes(validation.data.status) && {
        resolved_at: new Date().toISOString(),
      }),
      ...(slaDeadlines && {
        first_response_due_at: slaDeadlines.first_response_due_at.toISOString(),
        resolution_due_at: slaDeadlines.resolution_due_at.toISOString(),
      }),
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message || "Failed to create ticket." };
  }

  await supabase.from("ticket_activities").insert(
    buildTicketCreatedActivity({
      organizationId: orgId,
      ticketId: newTicket.id,
      actorId: user.id,
      status: validation.data.status,
      priority: validation.data.priority,
      assigned_to: validation.data.assigned_to,
    }),
  );

  scheduleWebhookDispatch(orgId);
  revalidatePath(`/org/${orgSlug}/tickets`);
  revalidatePath(`/org/${orgSlug}`);
  return { success: "Ticket created successfully.", ticketId: newTicket.id };
}

/**
 * Updates ticket details (title, description, status, priority, assignee).
 */
export async function updateTicketAction(
  ticketId: string,
  orgId: string,
  orgSlug: string,
  prevState: TicketActionState | null,
  formData: FormData,
): Promise<TicketActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  const supabase = await createClient();
  const user = context.user;

  if (!user) {
    return { error: "You must be signed in." };
  }

  const validation = await validateTicketInput(formData, orgId, supabase);
  if (validation.error || !validation.data) {
    return { error: validation.error || "Invalid ticket data." };
  }

  const { data: ticket, error: fetchError } = await supabase
    .from("tickets")
    .select(
      "id, status, priority, title, description, created_by, assigned_to, created_at, updated_at, first_response_breached, resolution_breached, first_response_due_at, first_responded_at, resolution_due_at, resolved_at",
    )
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchError || !ticket) {
    return { error: "Ticket not found." };
  }

  const editEval = canEditTicket(ticket, {
    id: user.id,
    role: context.currentRole,
  });
  if (!editEval.allowed) {
    return {
      error:
        editEval.reason || "You do not have permission to edit this ticket.",
    };
  }

  if (validation.data.assigned_to !== ticket.assigned_to) {
    const reassignEval = canReassignTicket(ticket, {
      id: user.id,
      role: context.currentRole,
    });
    if (!reassignEval.allowed) {
      return {
        error:
          reassignEval.reason ||
          "You do not have permission to reassign this ticket.",
      };
    }
  }

  if (validation.data.status !== ticket.status) {
    const evaluation = canTransitionTicket(ticket, validation.data.status, {
      id: user.id,
      role: context.currentRole,
    });

    if (!evaluation.allowed) {
      return { error: evaluation.reason || "Illegal status transition." };
    }
  }

  // Recalculate SLA deadlines from original created_at if priority changed
  let slaRecalcUpdate: Partial<ReturnType<typeof recalculateTicketSLA>> = {};
  if (validation.data.priority !== ticket.priority) {
    const { data: slaPolicy, error: policyError } = await supabase
      .from("organization_sla_policies")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (policyError) return { error: "Unable to load SLA policy." };
    if (slaPolicy) {
      slaRecalcUpdate = recalculateTicketSLA(
        { ...ticket, priority: validation.data.priority },
        slaPolicy,
        new Date(),
      );
    }
  }

  const slaMilestone = evaluateStatusTransitionSLA({
    fromStatus: ticket.status,
    toStatus: validation.data.status,
    transitionTime: new Date(),
    firstResponseDueAt:
      slaRecalcUpdate.first_response_due_at ?? ticket.first_response_due_at,
    firstRespondedAt: ticket.first_responded_at,
    resolutionDueAt:
      slaRecalcUpdate.resolution_due_at ?? ticket.resolution_due_at,
    resolvedAt: ticket.resolved_at,
  });

  const { data: savedTicket, error } = await supabase
    .from("tickets")
    .update({
      title: validation.data.title,
      description: validation.data.description,
      status: validation.data.status,
      priority: validation.data.priority,
      assigned_to: validation.data.assigned_to,
      ...slaRecalcUpdate,
      ...slaMilestone,
    })
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .eq("updated_at", ticket.updated_at)
    .select("*")
    .maybeSingle();

  if (error || !savedTicket) {
    return {
      error:
        error?.message ||
        "Ticket changed while you were editing. Refresh and try again.",
    };
  }

  const activitiesToInsert = buildTicketDiffActivities({
    organizationId: orgId,
    ticketId,
    actorId: user.id,
    current: ticket,
    updated: validation.data,
  });

  if (activitiesToInsert.length > 0) {
    await supabase.from("ticket_activities").insert(activitiesToInsert);
  }

  scheduleWebhookDispatch(orgId);
  revalidatePath(`/org/${orgSlug}/tickets/${ticketId}`);
  revalidatePath(`/org/${orgSlug}/tickets`);
  return { success: "Ticket updated successfully.", ticket: savedTicket };
}

/**
 * Quickly updates a ticket's status.
 */
export async function updateTicketStatusAction(
  ticketId: string,
  orgId: string,
  orgSlug: string,
  newStatus: TicketStatus,
): Promise<TicketActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  const supabase = await createClient();
  const user = context.user;

  if (!user) {
    return { error: "You must be signed in." };
  }

  if (!VALID_STATUSES.includes(newStatus)) {
    return { error: "Invalid status." };
  }

  const { data: ticket, error: fetchError } = await supabase
    .from("tickets")
    .select(
      "id, status, updated_at, created_by, assigned_to, first_response_due_at, first_responded_at, resolution_due_at, resolved_at",
    )
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchError || !ticket) {
    return { error: "Ticket not found." };
  }

  const evaluation = canTransitionTicket(ticket, newStatus, {
    id: user.id,
    role: context.currentRole,
  });

  if (!evaluation.allowed) {
    return { error: evaluation.reason || "Illegal status transition." };
  }

  const slaMilestone = evaluateStatusTransitionSLA({
    fromStatus: ticket.status,
    toStatus: newStatus,
    transitionTime: new Date(),
    firstResponseDueAt: ticket.first_response_due_at,
    firstRespondedAt: ticket.first_responded_at,
    resolutionDueAt: ticket.resolution_due_at,
    resolvedAt: ticket.resolved_at,
  });

  const { data: savedTicket, error } = await supabase
    .from("tickets")
    .update({ status: newStatus, ...slaMilestone })
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .eq("updated_at", ticket.updated_at)
    .select("id")
    .maybeSingle();

  if (error || !savedTicket) {
    return {
      error: error?.message || "Ticket changed. Refresh and try again.",
    };
  }

  await supabase.from("ticket_activities").insert(
    buildTicketStatusChangedActivity({
      organizationId: orgId,
      ticketId,
      actorId: user.id,
      oldStatus: ticket.status,
      newStatus,
    }),
  );

  scheduleWebhookDispatch(orgId);
  revalidatePath(`/org/${orgSlug}/tickets/${ticketId}`);
  revalidatePath(`/org/${orgSlug}/tickets`);
  return { success: `Status changed to ${newStatus}.` };
}

/**
 * Deletes a ticket.
 * Allowed for ticket creator or org owners/admins (RLS).
 */
export async function deleteTicketAction(
  ticketId: string,
  orgId: string,
  orgSlug: string,
  shouldRedirect: boolean = false,
): Promise<TicketActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  const supabase = await createClient();
  const user = context.user;

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { error } = await supabase
    .from("tickets")
    .delete()
    .eq("id", ticketId)
    .eq("organization_id", orgId);

  if (error) {
    return { error: error.message || "Failed to delete ticket." };
  }

  revalidatePath(`/org/${orgSlug}/tickets`);
  revalidatePath(`/org/${orgSlug}`);

  if (shouldRedirect) {
    redirect(`/org/${orgSlug}/tickets`);
  }

  return { success: "Ticket deleted successfully." };
}
