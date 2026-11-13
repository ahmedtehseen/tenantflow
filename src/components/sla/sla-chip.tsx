"use client";

import { getTicketSLAIndicator, type SLATicket } from "@/lib/sla/indicator";
import { useSLAClock } from "./sla-provider";

const colors = {
  on_track:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  met: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  at_risk: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  breached: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  paused: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  none: "",
};

export function SLAChip({
  ticket,
  metric,
}: {
  ticket: SLATicket;
  metric?: "response" | "resolution";
}) {
  const { policy, now } = useSLAClock();
  if (!policy || !now) return null;
  const indicator = getTicketSLAIndicator(
    ticket,
    policy,
    new Date(now),
    metric || (ticket.first_responded_at ? "resolution" : "response"),
  );
  if (!indicator) return null;
  return (
    <span
      title={`Due ${new Date(indicator.due).toLocaleString()} (${policy.timezone} business hours)`}
      className={`inline-block rounded px-2 py-1 text-[10px] font-medium ${colors[indicator.status]}`}
    >
      {indicator.text}
    </span>
  );
}
