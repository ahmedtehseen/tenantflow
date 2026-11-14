"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantContext, assertTenantScoping } from "@/lib/data/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWebhookUrl } from "#webhooks/url";
import { scheduleWebhookDispatch } from "@/lib/webhooks/schedule";

export async function saveWebhookAction(
  slug: string,
  orgId: string,
  webhookId: string | null,
  form: FormData,
) {
  const context = await getTenantContext(slug);
  assertTenantScoping(context, orgId);
  if (!["owner", "admin"].includes(context.currentRole))
    return { error: "Administrator access is required." };
  const events = [...new Set(form.getAll("events").map(String))];
  const allowed = [
    "ticket.created",
    "ticket.status_changed",
    "ticket.commented",
    "sla.breached",
  ];
  if (!events.length || events.some((event) => !allowed.includes(event)))
    return { error: "Choose at least one supported event." };
  let url: string;
  try {
    url = validateWebhookUrl(String(form.get("url") || "")).toString();
  } catch {
    return {
      error: "Enter a public HTTPS endpoint without credentials or a fragment.",
    };
  }
  const description = String(form.get("description") || "").trim();
  if (url.length > 2048 || description.length > 200)
    return { error: "Endpoint or description is too long." };
  const client = await createClient();
  const values = { url, description: description || null, events };
  const query = webhookId
    ? client
        .from("organization_webhooks")
        .update(values)
        .eq("id", webhookId)
        .eq("organization_id", orgId)
    : client
        .from("organization_webhooks")
        .insert({
          ...values,
          organization_id: orgId,
          secret: randomBytes(32).toString("hex"),
        });
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) return { error: "Unable to save webhook endpoint." };
  revalidatePath(`/org/${slug}/settings`);
  return { success: true, webhook: data };
}

export async function updateWebhookAction(
  slug: string,
  orgId: string,
  webhookId: string,
  action: "enable" | "disable" | "delete",
) {
  const context = await getTenantContext(slug);
  assertTenantScoping(context, orgId);
  if (!["owner", "admin"].includes(context.currentRole))
    return { error: "Administrator access is required." };
  if (!["enable", "disable", "delete"].includes(action))
    return { error: "Invalid action." };
  const client = await createClient();
  const query =
    action === "delete"
      ? client.from("organization_webhooks").delete()
      : client
          .from("organization_webhooks")
          .update({ is_active: action === "enable" });
  const { data, error } = await query
    .eq("id", webhookId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Unable to update webhook." };
  revalidatePath(`/org/${slug}/settings`);
  return { success: true };
}

export async function retryWebhookDeliveryAction(
  slug: string,
  orgId: string,
  deliveryId: string,
) {
  const context = await getTenantContext(slug);
  assertTenantScoping(context, orgId);
  if (!["owner", "admin"].includes(context.currentRole))
    return { error: "Administrator access is required." };
  const client = createAdminClient();
  const { data, error } = await client
    .from("webhook_deliveries")
    .update({
      status: "pending",
      attempts: 0,
      next_retry_at: null,
      claimed_until: null,
      claim_token: null,
    })
    .eq("id", deliveryId)
    .eq("organization_id", orgId)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (error || !data)
    return { error: "Only failed deliveries can be retried." };
  scheduleWebhookDispatch(orgId);
  revalidatePath(`/org/${slug}/settings`);
  return { success: true };
}
