"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext, assertTenantScoping } from "@/lib/data/tenant";
import { createClient } from "@/lib/supabase/server";
import { parseSLAPolicy } from "@/lib/sla/policy";

export async function updateSLAPolicyAction(
  slug: string,
  orgId: string,
  form: FormData,
) {
  const context = await getTenantContext(slug);
  assertTenantScoping(context, orgId);
  if (!["owner", "admin"].includes(context.currentRole))
    return { error: "Administrator access is required." };
  let policy;
  try {
    policy = parseSLAPolicy(form);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid SLA policy.",
    };
  }
  const client = await createClient();
  const { data, error } = await client
    .from("organization_sla_policies")
    .update(policy)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Unable to save SLA policy." };
  revalidatePath(`/org/${slug}/settings`);
  return { success: true };
}
