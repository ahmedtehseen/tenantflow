import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scheduleWebhookRetry,
  removeWebhookRetry,
  getReadyWebhookRetries,
} from "@/lib/redis/client";
import { calculateRetryBackoffMs } from "#webhooks/signer";
import { postWebhook } from "./transport";
import type { WebhookDelivery, OrganizationWebhook } from "@/types/database";

export async function dispatchWebhookDelivery(deliveryId: string) {
  const client = createAdminClient();
  const token = randomUUID();
  const { data: rows, error: claimError } = await client.rpc(
    "claim_webhook_delivery",
    { p_id: deliveryId, p_token: token },
  );
  const claimed = rows?.[0];
  if (claimError) throw new Error("Unable to claim webhook delivery.");
  if (!claimed) return;
  const delivery = claimed as WebhookDelivery;
  const { data: webhook, error: webhookError } = await client
    .from("organization_webhooks")
    .select("*")
    .eq("id", delivery.webhook_id)
    .eq("organization_id", delivery.organization_id)
    .maybeSingle();
  if (webhookError) throw new Error("Unable to load webhook endpoint.");
  let code: number | null = null;
  let lastError: string | null = null;
  const endpoint = webhook as OrganizationWebhook | null;
  if (!endpoint?.is_active)
    lastError = "Webhook endpoint is inactive or removed.";
  else {
    try {
      code = await postWebhook(
        endpoint.url,
        JSON.stringify(delivery.payload),
        endpoint.secret,
        delivery.id,
      );
      if (code < 200 || code >= 300)
        lastError = `Endpoint returned HTTP ${code}.`;
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Webhook delivery failed.";
    }
  }
  const attempts = delivery.attempts;
  const delivered = !lastError;
  const exhausted = attempts >= delivery.max_attempts || !endpoint?.is_active;
  const nextRetryAt =
    !delivered && !exhausted
      ? new Date(Date.now() + calculateRetryBackoffMs(attempts)).toISOString()
      : null;
  const { data: saved, error } = await client
    .from("webhook_deliveries")
    .update({
      attempts,
      status: delivered ? "delivered" : exhausted ? "failed" : "pending",
      last_status_code: code,
      last_error: lastError,
      next_retry_at: nextRetryAt,
      delivered_at: delivered ? new Date().toISOString() : null,
      claimed_until: null,
      claim_token: null,
    })
    .eq("id", deliveryId)
    .eq("claim_token", token)
    .select("id")
    .maybeSingle();
  if (error || !saved)
    throw new Error("Unable to record webhook delivery result.");
  // SQL remains the durable source of truth if Redis is unavailable.
  try {
    if (nextRetryAt)
      await scheduleWebhookRetry(deliveryId, new Date(nextRetryAt).getTime());
    else await removeWebhookRetry(deliveryId);
  } catch {
    console.error("Webhook retry queue unavailable", { deliveryId });
  }
}

export async function dispatchPendingWebhooks(orgId?: string) {
  const client = createAdminClient();
  const now = new Date().toISOString();
  let query = client
    .from("webhook_deliveries")
    .select("id")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .or(`claimed_until.is.null,claimed_until.lt.${now}`)
    .order("created_at")
    .limit(orgId ? 5 : 20);
  if (orgId) query = query.eq("organization_id", orgId);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load pending webhook deliveries.");
  let readyRetryIds: string[] = [];
  if (!orgId) {
    try {
      readyRetryIds = await getReadyWebhookRetries(Date.now());
    } catch {
      console.error(
        "Redis retry queue unavailable. Recovering jobs from Supabase.",
      );
    }
  }
  const deliveryIds = [
    ...new Set([
      ...readyRetryIds,
      ...(data || []).map((delivery) => delivery.id as string),
    ]),
  ].slice(0, orgId ? 5 : 20);
  const results = await Promise.allSettled(
    deliveryIds.map((id) => dispatchWebhookDelivery(id)),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new Error("Some webhook jobs could not be processed.");
  if (!orgId) {
    // Remove completed retry entries after durable queue processing. A pending future retry keeps its score.
    try {
      for (const id of readyRetryIds) {
        const { data: row, error: readError } = await client
          .from("webhook_deliveries")
          .select("status,next_retry_at")
          .eq("id", id)
          .maybeSingle();
        if (!readError && (!row || row.status !== "pending"))
          await removeWebhookRetry(id);
      }
    } catch {
      console.error("Webhook retry queue cleanup unavailable");
    }
  }
}
