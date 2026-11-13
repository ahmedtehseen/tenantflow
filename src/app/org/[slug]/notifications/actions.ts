"use server";

import { getTenantContext, assertTenantScoping } from "@/lib/data/tenant";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(
  orgSlug: string,
  orgId: string,
  notificationId: string | null,
) {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);
  if (!context.currentRole)
    return { error: "Workspace membership is required." };
  const client = await createClient();
  let query = client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("recipient_id", context.user.id)
    .is("read_at", null);
  if (notificationId) query = query.eq("id", notificationId);
  const { error } = await query;
  return error
    ? { error: "Unable to mark notifications as read." }
    : { success: true };
}
