import type {
  TicketStatus,
  OrgRole,
  TicketPriority,
  TicketActivityInsert,
} from "@/types/database";

export type { TicketStatus, OrgRole, TicketPriority, TicketActivityInsert };

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

  // open -> in_progress: Any workspace member if unassigned; Assignee, Admin, or Owner if assigned
  if (ticket.status === "open" && targetStatus === "in_progress") {
    if (ticket.assigned_to !== null && ticket.assigned_to !== actor.id && !isAdmin && !isOwner) {
      return {
        allowed: false,
        reason: "This ticket is assigned to another team member. Only the assignee, workspace admin, or owner can start work on it.",
      };
    }
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

/**
 * Validates whether an actor can edit ticket properties (title, description, priority).
 * Permitted for: Owner, Admin, Ticket Author, Ticket Assignee.
 */
export function canEditTicket(
  ticket: TicketLifecycleTarget,
  actor: TicketActorContext,
): TransitionEvaluation {
  const isOwner = actor.role === "owner";
  const isAdmin = actor.role === "admin";
  const isAuthor = ticket.created_by !== null && ticket.created_by === actor.id;
  const isAssignee = ticket.assigned_to !== null && ticket.assigned_to === actor.id;

  if (isOwner || isAdmin || isAuthor || isAssignee) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason:
      "You do not have permission to edit this ticket. Only the assignee, author, or workspace admins can make changes.",
  };
}

/**
 * Validates whether an actor can reassign a ticket.
 * Permitted for: Owner, Admin, Ticket Author, Ticket Assignee.
 */
export function canReassignTicket(
  ticket: TicketLifecycleTarget,
  actor: TicketActorContext,
): TransitionEvaluation {
  const isOwner = actor.role === "owner";
  const isAdmin = actor.role === "admin";
  const isAuthor = ticket.created_by !== null && ticket.created_by === actor.id;
  const isAssignee = ticket.assigned_to !== null && ticket.assigned_to === actor.id;

  if (isOwner || isAdmin || isAuthor || isAssignee) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason:
      "You do not have permission to reassign this ticket. Only the assignee, author, or workspace admins can change the assignee.",
  };
}

/**
 * Validates whether an actor can update ticket properties, reassignment, and status transition.
 */
export function validateTicketUpdateRBAC(
  ticket: TicketLifecycleTarget,
  newData: {
    status: TicketStatus;
    assigned_to: string | null;
  },
  actor: TicketActorContext,
): TransitionEvaluation {
  // 1. General edit permission check
  const editEval = canEditTicket(ticket, actor);
  if (!editEval.allowed) {
    return editEval;
  }

  // 2. Reassignment permission check if assigned_to changed
  if (newData.assigned_to !== ticket.assigned_to) {
    const reassignEval = canReassignTicket(ticket, actor);
    if (!reassignEval.allowed) {
      return reassignEval;
    }
  }

  // 3. Status transition check if status changed
  if (newData.status !== ticket.status) {
    const transitionEval = canTransitionTicket(ticket, newData.status, actor);
    if (!transitionEval.allowed) {
      return transitionEval;
    }
  }

  return { allowed: true };
}

export interface BuildTicketDiffActivitiesParams {
  organizationId: string;
  ticketId: string;
  actorId: string | null;
  current: {
    status: TicketStatus;
    priority: TicketPriority;
    assigned_to: string | null;
    title: string;
    description: string | null;
  };
  updated: {
    status: TicketStatus;
    priority: TicketPriority;
    assigned_to: string | null;
    title: string;
    description: string | null;
  };
}

export function buildTicketDiffActivities(
  params: BuildTicketDiffActivitiesParams,
): TicketActivityInsert[] {
  const activities: TicketActivityInsert[] = [];
  const { organizationId, ticketId, actorId, current, updated } = params;

  if (updated.status !== current.status) {
    activities.push({
      organization_id: organizationId,
      ticket_id: ticketId,
      actor_id: actorId,
      activity_type: "status_changed",
      old_value: current.status,
      new_value: updated.status,
    });
  }

  if (updated.priority !== current.priority) {
    activities.push({
      organization_id: organizationId,
      ticket_id: ticketId,
      actor_id: actorId,
      activity_type: "priority_changed",
      old_value: current.priority,
      new_value: updated.priority,
    });
  }

  if (updated.assigned_to !== current.assigned_to) {
    activities.push({
      organization_id: organizationId,
      ticket_id: ticketId,
      actor_id: actorId,
      activity_type: "assignee_changed",
      old_value: current.assigned_to,
      new_value: updated.assigned_to,
    });
  }

  if (
    updated.title !== current.title ||
    (updated.description || null) !== (current.description || null)
  ) {
    activities.push({
      organization_id: organizationId,
      ticket_id: ticketId,
      actor_id: actorId,
      activity_type: "details_updated",
      old_value: null,
      new_value: null,
      metadata: { title_changed: updated.title !== current.title },
    });
  }

  return activities;
}

export function buildTicketCreatedActivity(params: {
  organizationId: string;
  ticketId: string;
  actorId: string | null;
  status: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: string | null;
}): TicketActivityInsert {
  return {
    organization_id: params.organizationId,
    ticket_id: params.ticketId,
    actor_id: params.actorId,
    activity_type: "created",
    old_value: null,
    new_value: params.status,
    metadata: {
      priority: params.priority,
      assigned_to: params.assigned_to,
    },
  };
}

export function buildTicketStatusChangedActivity(params: {
  organizationId: string;
  ticketId: string;
  actorId: string | null;
  oldStatus: TicketStatus;
  newStatus: TicketStatus;
}): TicketActivityInsert {
  return {
    organization_id: params.organizationId,
    ticket_id: params.ticketId,
    actor_id: params.actorId,
    activity_type: "status_changed",
    old_value: params.oldStatus,
    new_value: params.newStatus,
  };
}


