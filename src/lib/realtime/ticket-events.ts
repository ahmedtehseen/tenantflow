import type { TicketStatus, TicketPriority } from "@/types/database";

export interface TicketMemberInfo {
  id: string;
  full_name: string | null;
  email: string;
}

export interface TicketItem {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
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
        creator,
        assignee,
      };

      const existingIndex = currentTickets.findIndex((t) => t.id === formattedTicket.id);
      if (existingIndex !== -1) {
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
        if (ticket.id !== raw.id) {
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
  previousStatus: TicketStatus
): TicketItem[] {
  return currentTickets.map((ticket) => {
    if (ticket.id === ticketId) {
      return {
        ...ticket,
        status: previousStatus,
      };
    }
    return ticket;
  });
}
