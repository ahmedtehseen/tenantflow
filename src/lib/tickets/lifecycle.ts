import type { TicketStatus, OrgRole } from "@/types/database";

export type { TicketStatus, OrgRole };

export interface TicketActorContext {
  id: string;
  name?: string;
  role: OrgRole;
}

export interface TicketLifecycleTarget {
  id: string;
  status: TicketStatus;
  created_by: string | null;
  assigned_to: string | null;
}

export interface TransitionEvaluation {
  allowed: boolean;
  reason?: string;
}

// Backward compatibility aliases
export type TicketTransitionActor = TicketActorContext;
export type TicketTransitionContext = TicketLifecycleTarget;
export type TransitionValidationResult = TransitionEvaluation;

export const VALID_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export const FSM_EDGES: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress"],
  in_progress: ["resolved", "open"],
  resolved: ["closed", "in_progress"],
  closed: ["open"],
};

export const LEGAL_TICKET_TRANSITIONS = FSM_EDGES;

/**
 * Validates whether an actor can execute a ticket status transition
 * according to ADR 0004: Role-Gated Ticket Finite State Machine.
 */
export function canTransitionTicket(
  ticket: TicketLifecycleTarget,
  targetStatus: TicketStatus,
  actor: TicketActorContext,
): TransitionEvaluation {
  if (!VALID_STATUSES.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `"${targetStatus}" is not a recognized ticket status.`,
    };
  }

  if (ticket.status === targetStatus) {
    return {
      allowed: false,
      reason: `Ticket is already in status "${targetStatus}".`,
    };
  }

  const legalNext = FSM_EDGES[ticket.status] || [];
  if (!legalNext.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Invalid transition from "${ticket.status}" to "${targetStatus}". Allowed next statuses: ${legalNext.join(", ")}.`,
    };
  }

  const isOwner = actor.role === "owner";
  const isAdmin = actor.role === "admin";
  const isAuthor = ticket.created_by !== null && ticket.created_by === actor.id;
  const isAssignee = ticket.assigned_to !== null && ticket.assigned_to === actor.id;

  // open -> in_progress: Any workspace member or assignee
  if (ticket.status === "open" && targetStatus === "in_progress") {
    return { allowed: true };
  }

  // in_progress -> resolved: Assignee, Admin, or Owner
  if (ticket.status === "in_progress" && targetStatus === "resolved") {
    if (isAssignee || isAdmin || isOwner) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Only the assigned member, workspace admin, or owner can mark a ticket as resolved.",
    };
  }

  // in_progress -> open: Assignee, Admin, or Owner (un-starting work)
  if (ticket.status === "in_progress" && targetStatus === "open") {
    if (isAssignee || isAdmin || isOwner) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Only the assigned member, admin, or owner can return an in-progress ticket back to open.",
    };
  }

  // resolved -> closed: Ticket Author, Admin, or Owner
  if (ticket.status === "resolved" && targetStatus === "closed") {
    if (isAuthor || isAdmin || isOwner) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Only the ticket author, workspace admin, or owner can close a resolved ticket.",
    };
  }

  // resolved -> in_progress: Author, Assignee, Admin, or Owner (re-opening investigation / rejecting resolution)
  if (ticket.status === "resolved" && targetStatus === "in_progress") {
    if (isAuthor || isAssignee || isAdmin || isOwner) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Only the author, assignee, admin, or owner can return a resolved ticket to in-progress.",
    };
  }

  // closed -> open: Admin or Owner only
  if (ticket.status === "closed" && targetStatus === "open") {
    if (isAdmin || isOwner) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Reopening a closed ticket requires Admin or Owner authority.",
    };
  }

  return { allowed: false, reason: "Permission denied for this state transition." };
}

/**
 * Returns the list of next statuses that the given actor is permitted
 * to transition the ticket into, based on its current status and actor role/relationship.
 */
export function getAvailableNextStatuses(
  ticket: TicketLifecycleTarget,
  actor: TicketActorContext,
): TicketStatus[] {
  const candidateStatuses = FSM_EDGES[ticket.status] || [];
  return candidateStatuses.filter(
    (targetStatus) => canTransitionTicket(ticket, targetStatus, actor).allowed,
  );
}
