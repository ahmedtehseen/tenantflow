import {
  calculateRemainingBusinessMinutes,
  getSLAStatus,
  isBusinessOpen,
} from "#sla/business-hours";
import { getTargetMinutesForPriority } from "#sla/ticket-sla";
import type { OrganizationSLAPolicy, Ticket } from "#types/database";

export type SLATicket = Pick<Ticket, "priority"> &
  Partial<
    Pick<
      Ticket,
      | "first_response_due_at"
      | "first_responded_at"
      | "resolution_due_at"
      | "resolved_at"
      | "status"
      | "first_response_breached"
      | "resolution_breached"
    >
  >;

export function getTicketSLAIndicator(
  ticket: SLATicket,
  policy: OrganizationSLAPolicy,
  now: Date,
  metric: "response" | "resolution",
) {
  const due =
    metric === "response"
      ? ticket.first_response_due_at
      : ticket.resolution_due_at;
  const completed =
    metric === "response" ? ticket.first_responded_at : ticket.resolved_at;
  if (!due) return null;
  const targets = getTargetMinutesForPriority(ticket.priority, policy);
  const target =
    metric === "response" ? targets.responseMinutes : targets.resolutionMinutes;
  const remaining = calculateRemainingBusinessMinutes(now, due, policy);
  const breached =
    metric === "response"
      ? ticket.first_response_breached
      : ticket.resolution_breached;
  const businessOpen = isBusinessOpen(now, policy);
  const calculatedStatus = getSLAStatus(
    now,
    due,
    completed || null,
    businessOpen,
    target,
    remaining,
  );
  const status = completed
    ? calculatedStatus
    : breached
      ? "breached"
      : !businessOpen
        ? "paused"
        : calculatedStatus;
  const label = metric === "response" ? "Response" : "Resolution";
  const time =
    remaining >= 60
      ? `${Math.floor(remaining / 60)}h ${remaining % 60}m`
      : `${remaining}m`;
  const text =
    status === "met"
      ? `${label} met`
      : status === "breached"
        ? `${label} breached`
        : `${label} ${time}${status === "paused" ? " · paused" : status === "at_risk" ? " · at risk" : ""}`;
  return { status, text, due };
}
