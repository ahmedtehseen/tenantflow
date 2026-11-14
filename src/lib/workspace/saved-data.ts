import type { WorkspaceData } from "@/lib/data/workspace";
import type { TenantContext } from "@/lib/data/tenant";
import type {
  Ticket,
  OrganizationSLAPolicy,
  OrganizationWebhook,
} from "#types/database";
import {
  applyTicketRealtimeEvent,
  isOlderTicketEvent,
  type TicketMemberInfo,
} from "#tickets/events";

export function applySavedTicket(
  data: WorkspaceData | undefined,
  ticket: Ticket,
): WorkspaceData | undefined {
  if (!data || data.org.id !== ticket.organization_id) return data;
  if (!("memberOptions" in data)) return data;
  const memberMap = new Map<string, TicketMemberInfo>(
    data.memberOptions.map((member) => [
      member.user_id,
      {
        id: member.user_id,
        full_name: member.full_name,
        email: member.email,
      },
    ]),
  );
  if ("tickets" in data) {
    return {
      ...data,
      tickets: applyTicketRealtimeEvent(
        data.tickets,
        { eventType: "UPDATE", new: ticket },
        memberMap,
      ),
    };
  }
  if (
    "ticket" in data &&
    data.ticket.id === ticket.id &&
    !isOlderTicketEvent(data.ticket, ticket)
  ) {
    return {
      ...data,
      ticket,
      creatorProfile: ticket.created_by
        ? (memberMap.get(ticket.created_by) ?? data.creatorProfile)
        : null,
      assigneeProfile: ticket.assigned_to
        ? (memberMap.get(ticket.assigned_to) ?? null)
        : null,
    };
  }
  return data;
}

export function applySavedOrganization(
  data: WorkspaceData | undefined,
  organization: TenantContext["currentOrg"],
): WorkspaceData | undefined {
  if (!data || data.org.id !== organization.id) return data;
  if (
    data.org.updated_at &&
    organization.updated_at &&
    Date.parse(data.org.updated_at) > Date.parse(organization.updated_at)
  )
    return data;
  return { ...data, org: organization };
}

export function applySavedPolicy(
  data: WorkspaceData | undefined,
  policy: OrganizationSLAPolicy,
): WorkspaceData | undefined {
  if (!data || data.org.id !== policy.organization_id || !("policy" in data))
    return data;
  if (
    data.policy?.updated_at &&
    Date.parse(data.policy.updated_at) > Date.parse(policy.updated_at)
  )
    return data;
  return { ...data, policy };
}

export function applySavedWebhook(
  data: WorkspaceData | undefined,
  webhook: OrganizationWebhook,
): WorkspaceData | undefined {
  if (!data || data.org.id !== webhook.organization_id || !("webhooks" in data))
    return data;
  const existing = data.webhooks.find(
    (item: { id: string }) => item.id === webhook.id,
  );
  const webhooks = existing
    ? data.webhooks.map((item: { id: string }) =>
        item.id === webhook.id ? webhook : item,
      )
    : [webhook, ...data.webhooks];
  return { ...data, webhooks };
}
