import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPendingWebhooks } from "@/lib/webhooks/dispatcher";
import {
  calculateRemainingBusinessMinutes,
  isBusinessOpen,
} from "#sla/business-hours";
import { getTargetMinutesForPriority } from "#sla/ticket-sla";
import type { OrganizationSLAPolicy, Ticket } from "@/types/database";

export async function processBackgroundJobs() {
  const client = createAdminClient();
  let breaches = 0;
  // Bound each run while draining multiple full batches during a backlog.
  for (let batch = 0; batch < 10; batch++) {
    const { data, error } = await client.rpc("process_sla_breaches");
    if (error) throw new Error("SLA breach sweep failed.");
    breaches += Number(data);
    if (Number(data) < 200) break;
  }
  const now = new Date();
  let cursor = "00000000-0000-0000-0000-000000000000";
  let atRisk = 0;
  for (;;) {
    const { data: tickets, error } = await client
      .from("tickets")
      .select("*")
      .in("status", ["open", "in_progress"])
      .gt("id", cursor)
      .order("id")
      .limit(200);
    if (error) throw new Error("Unable to load SLA warning candidates.");
    if (!tickets?.length) break;
    const orgIds = [
      ...new Set(tickets.map((ticket) => ticket.organization_id)),
    ];
    const { data: policies, error: policyError } = await client
      .from("organization_sla_policies")
      .select("*")
      .in("organization_id", orgIds);
    if (policyError) throw new Error("Unable to load SLA policies.");
    const policyMap = new Map(
      ((policies as OrganizationSLAPolicy[]) || []).map((policy) => [
        policy.organization_id,
        policy,
      ]),
    );
    for (const ticket of tickets as Ticket[]) {
      const policy = policyMap.get(ticket.organization_id);
      if (!policy || !isBusinessOpen(now, policy)) continue;
      const targets = getTargetMinutesForPriority(ticket.priority, policy);
      const metrics = [
        {
          name: "first_response",
          due: ticket.first_response_due_at,
          completed: ticket.first_responded_at,
          target: targets.responseMinutes,
        },
        {
          name: "resolution",
          due: ticket.resolution_due_at,
          completed: ticket.resolved_at,
          target: targets.resolutionMinutes,
        },
      ];
      for (const metric of metrics) {
        if (!metric.due || metric.completed || new Date(metric.due) <= now)
          continue;
        if (
          calculateRemainingBusinessMinutes(now, metric.due, policy) >
          Math.max(60, metric.target * 0.2)
        )
          continue;
        const { error: warningError } = await client.rpc("notify_sla_at_risk", {
          p_ticket: ticket.id,
          p_metric: metric.name,
          p_due: metric.due,
        });
        if (warningError) throw new Error("Unable to queue SLA warning.");
        atRisk++;
      }
    }
    cursor = tickets[tickets.length - 1].id;
    if (tickets.length < 200) break;
  }
  await dispatchPendingWebhooks();
  return { breaches, atRisk };
}
