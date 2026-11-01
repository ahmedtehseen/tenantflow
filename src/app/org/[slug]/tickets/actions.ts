"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TicketStatus, TicketPriority } from "@/types/database";

export interface TicketActionState {
  error?: string | null;
  success?: string | null;
}

const VALID_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const VALID_PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

/**
 * Creates a ticket within an organization.
 * Caller must be an authenticated member of the organization.
 */
export async function createTicketAction(
  orgId: string,
  orgSlug: string,
  prevState: TicketActionState | null,
  formData: FormData,
): Promise<TicketActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a ticket." };
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const status = (formData.get("status")?.toString().trim() ?? "open") as TicketStatus;
  const priority = (formData.get("priority")?.toString().trim() ?? "medium") as TicketPriority;
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

  // If assigned_to is provided, ensure they belong to this org
  if (assigned_to) {
    const { data: isMember } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", assigned_to)
      .maybeSingle();

    if (!isMember) {
      return { error: "The selected assignee is not a member of this organization." };
    }
  }

  const { data: newTicket, error } = await supabase
    .from("tickets")
    .insert({
      organization_id: orgId,
      title,
      description: description || null,
      status,
      priority,
      created_by: user.id,
      assigned_to,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message || "Failed to create ticket." };
  }

  revalidatePath(`/org/${orgSlug}/tickets`);
  revalidatePath(`/org/${orgSlug}`);
  redirect(`/org/${orgSlug}/tickets/${newTicket.id}`);
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const status = (formData.get("status")?.toString().trim() ?? "open") as TicketStatus;
  const priority = (formData.get("priority")?.toString().trim() ?? "medium") as TicketPriority;
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
      return { error: "The selected assignee is not a member of this organization." };
    }
  }

  const { error } = await supabase
    .from("tickets")
    .update({
      title,
      description: description || null,
      status,
      priority,
      assigned_to,
    })
    .eq("id", ticketId)
    .eq("organization_id", orgId);

  if (error) {
    return { error: error.message || "Failed to update ticket." };
  }

  revalidatePath(`/org/${orgSlug}/tickets/${ticketId}`);
  revalidatePath(`/org/${orgSlug}/tickets`);
  return { success: "Ticket updated successfully." };
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  if (!VALID_STATUSES.includes(newStatus)) {
    return { error: "Invalid status." };
  }

  const { error } = await supabase
    .from("tickets")
    .update({ status: newStatus })
    .eq("id", ticketId)
    .eq("organization_id", orgId);

  if (error) {
    return { error: error.message || "Failed to update status." };
  }

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
): Promise<TicketActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
  redirect(`/org/${orgSlug}/tickets`);
}

