import type {
  TicketPriority,
  TicketStatus,
  SLAPolicyConfig,
  Ticket,
} from "#types/database";
import {
  calculateBusinessDeadline,
  isBusinessOpen,
  getNearestBusinessOpenTime,
} from "#sla/business-hours";

export interface SLADeadlines {
  first_response_due_at: Date;
  resolution_due_at: Date;
}

/**
 * Returns the response and resolution target minutes for a given priority from the SLA policy.
 */
export function getTargetMinutesForPriority(
  priority: TicketPriority,
  policy: SLAPolicyConfig,
): { responseMinutes: number; resolutionMinutes: number } {
  const defaults = {
    urgent: { response: 60, resolution: 240 },
    high: { response: 240, resolution: 1440 },
    medium: { response: 480, resolution: 2880 },
    low: { response: 1440, resolution: 4320 },
  };
  switch (priority) {
    case "urgent":
      return {
        responseMinutes:
          policy.urgent_response_minutes ?? defaults.urgent.response,
        resolutionMinutes:
          policy.urgent_resolution_minutes ?? defaults.urgent.resolution,
      };
    case "high":
      return {
        responseMinutes: policy.high_response_minutes ?? defaults.high.response,
        resolutionMinutes:
          policy.high_resolution_minutes ?? defaults.high.resolution,
      };
    case "medium":
      return {
        responseMinutes:
          policy.medium_response_minutes ?? defaults.medium.response,
        resolutionMinutes:
          policy.medium_resolution_minutes ?? defaults.medium.resolution,
      };
    case "low":
      return {
        responseMinutes: policy.low_response_minutes ?? defaults.low.response,
        resolutionMinutes:
          policy.low_resolution_minutes ?? defaults.low.resolution,
      };
  }
}

/**
 * Computes First Response and Resolution due dates from ticket creation time.
 * If created outside business hours, the clock starts at the next business open time.
 */
export function computeTicketSLADeadlines(
  createdAt: Date | string,
  priority: TicketPriority,
  policy: SLAPolicyConfig,
): SLADeadlines {
  const startTime = getNearestBusinessOpenTime(createdAt, policy);
  const { responseMinutes, resolutionMinutes } = getTargetMinutesForPriority(
    priority,
    policy,
  );
  return {
    first_response_due_at: calculateBusinessDeadline(
      startTime,
      responseMinutes,
      policy,
    ),
    resolution_due_at: calculateBusinessDeadline(
      startTime,
      resolutionMinutes,
      policy,
    ),
  };
}

export interface StatusTransitionSLAInput {
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  transitionTime: Date | string;
  firstResponseDueAt?: Date | string | null;
  firstRespondedAt?: Date | string | null;
  resolutionDueAt?: Date | string | null;
  resolvedAt?: Date | string | null;
}

export interface StatusTransitionSLAResult {
  first_responded_at?: string | null;
  first_response_breached?: boolean;
  resolved_at?: string | null;
  resolution_breached?: boolean;
}

/**
 * Evaluates a ticket status transition and returns SLA column updates.
 */
export function evaluateStatusTransitionSLA(
  input: StatusTransitionSLAInput,
): StatusTransitionSLAResult {
  const {
    fromStatus,
    toStatus,
    transitionTime,
    firstResponseDueAt,
    firstRespondedAt,
    resolutionDueAt,
    resolvedAt,
  } = input;

  const now = new Date(transitionTime);
  const result: StatusTransitionSLAResult = {};

  // open -> in_progress: marks First Response milestone
  if (fromStatus === "open" && toStatus === "in_progress") {
    if (!firstRespondedAt) {
      result.first_responded_at = now.toISOString();
      if (firstResponseDueAt) {
        result.first_response_breached = now > new Date(firstResponseDueAt);
      }
    }
  }

  // any -> resolved: marks Resolution milestone
  if (toStatus === "resolved" && fromStatus !== "resolved") {
    if (!resolvedAt) {
      result.resolved_at = now.toISOString();
      if (resolutionDueAt) {
        result.resolution_breached = now > new Date(resolutionDueAt);
      }
    }
  }

  // resolved or closed -> open or in_progress: reopening clears resolution milestone
  const wasTerminal = fromStatus === "resolved" || fromStatus === "closed";
  const isReopening = toStatus === "open" || toStatus === "in_progress";
  if (wasTerminal && isReopening) {
    result.resolved_at = null;
    result.resolution_breached = false;
  }

  return result;
}

/** Re-evaluate a changed priority against the original creation time and recorded milestones. */
export function recalculateTicketSLA(
  ticket: Pick<
    Ticket,
    | "created_at"
    | "priority"
    | "first_responded_at"
    | "resolved_at"
    | "first_response_breached"
    | "resolution_breached"
  >,
  policy: SLAPolicyConfig,
  now: Date,
) {
  const deadlines = computeTicketSLADeadlines(
    ticket.created_at,
    ticket.priority,
    policy,
  );
  const businessOpen = isBusinessOpen(now, policy);
  return {
    first_response_due_at: deadlines.first_response_due_at.toISOString(),
    resolution_due_at: deadlines.resolution_due_at.toISOString(),
    first_response_breached: ticket.first_responded_at
      ? new Date(ticket.first_responded_at) > deadlines.first_response_due_at
      : now > deadlines.first_response_due_at &&
        (ticket.first_response_breached || businessOpen),
    resolution_breached: ticket.resolved_at
      ? new Date(ticket.resolved_at) > deadlines.resolution_due_at
      : now > deadlines.resolution_due_at &&
        (ticket.resolution_breached || businessOpen),
  };
}
