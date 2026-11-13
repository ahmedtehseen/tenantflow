import type { TicketStatus, TicketPriority } from "@/types/database";

export interface TicketMemberInfo {
  id: string;
  full_name: string | null;
  email: string;
}

export interface TicketItem {
  first_response_breached?: boolean;
  resolution_breached?: boolean;
  first_response_due_at?: string | null;
  first_responded_at?: string | null;
  resolution_due_at?: string | null;
  resolved_at?: string | null;
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at?: string;
  creator?: TicketMemberInfo | null;
  assignee?: TicketMemberInfo | null;
}

export interface MemberOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

export interface RealtimeTicketChangeEvent {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old?: any;
}

export function isOlderTicketEvent(current: TicketItem, incoming: { updated_at?: string }): boolean {
  return Boolean(current.updated_at && incoming.updated_at &&
    Date.parse(incoming.updated_at) < Date.parse(current.updated_at));
}

/**
 * Pure reducer function that applies Postgres change events (INSERT, UPDATE, DELETE)
 * on a local array of tickets, resolving creator and assignee profiles from memberMap.
 */
export function applyTicketRealtimeEvent(
  currentTickets: TicketItem[],
  event: RealtimeTicketChangeEvent,
  memberMap: Map<string, TicketMemberInfo>
): TicketItem[] {
  if (!event || !event.eventType) {
    return [...currentTickets];
  }

  switch (event.eventType) {
    case "INSERT": {
      const raw = event.new;
      if (!raw || !raw.id) {
        return [...currentTickets];
      }

      const creator = raw.created_by
        ? (memberMap.get(raw.created_by) ?? raw.creator ?? null)
        : null;
      const assignee = raw.assigned_to
        ? (memberMap.get(raw.assigned_to) ?? raw.assignee ?? null)
        : null;

      const formattedTicket: TicketItem = {
        id: raw.id,
        organization_id: raw.organization_id,
        title: raw.title,
        description: raw.description ?? null,
        status: raw.status,
        priority: raw.priority,
        created_by: raw.created_by ?? null,
        assigned_to: raw.assigned_to ?? null,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        first_response_breached: raw.first_response_breached ?? false,
        resolution_breached: raw.resolution_breached ?? false,
        first_response_due_at: raw.first_response_due_at ?? null,
        first_responded_at: raw.first_responded_at ?? null,
        resolution_due_at: raw.resolution_due_at ?? null,
        resolved_at: raw.resolved_at ?? null,
        creator,
        assignee,
      };

      const existingIndex = currentTickets.findIndex((t) => t.id === formattedTicket.id);
      if (existingIndex !== -1) {
        if (isOlderTicketEvent(currentTickets[existingIndex], raw)) return currentTickets;
        return currentTickets.map((t, idx) => (idx === existingIndex ? formattedTicket : t));
      }

      return [formattedTicket, ...currentTickets];
    }

    case "UPDATE": {
      const raw = event.new;
      if (!raw || !raw.id) {
        return [...currentTickets];
      }

      return currentTickets.map((ticket) => {
        if (ticket.id !== raw.id || isOlderTicketEvent(ticket, raw)) {
          return ticket;
        }

        const createdBy = raw.created_by !== undefined ? raw.created_by : ticket.created_by;
        const assignedTo = raw.assigned_to !== undefined ? raw.assigned_to : ticket.assigned_to;

        const creator = createdBy
          ? (memberMap.get(createdBy) ?? (createdBy === ticket.created_by ? ticket.creator : null) ?? null)
          : null;

        const assignee = assignedTo
          ? (memberMap.get(assignedTo) ?? (assignedTo === ticket.assigned_to ? ticket.assignee : null) ?? null)
          : null;

        return {
          ...ticket,
          ...raw,
          creator,
          assignee,
        };
      });
    }

    case "DELETE": {
      const targetId = event.old?.id ?? event.new?.id;
      if (!targetId) {
        return [...currentTickets];
      }

      return currentTickets.filter((ticket) => ticket.id !== targetId);
    }

    default:
      return [...currentTickets];
  }
}

/**
 * Optimistically updates a ticket's status in the local list.
 */
export function optimisticTicketStatusTransition(
  currentTickets: TicketItem[],
  ticketId: string,
  targetStatus: TicketStatus
): TicketItem[] {
  return currentTickets.map((ticket) => {
    if (ticket.id === ticketId) {
      return {
        ...ticket,
        status: targetStatus,
      };
    }
    return ticket;
  });
}

/**
 * Reverts an optimistic ticket status transition back to previousStatus
 * if a server action fails.
 */
export function revertOptimisticTicketStatus(
  currentTickets: TicketItem[],
  ticketId: string,
  previousStatus: TicketStatus,
  expectedStatus?: TicketStatus
): TicketItem[] {
  return currentTickets.map((ticket) => {
    if (ticket.id === ticketId && (expectedStatus === undefined || ticket.status === expectedStatus)) {
      return {
        ...ticket,
        status: previousStatus,
      };
    }
    return ticket;
  });
}
