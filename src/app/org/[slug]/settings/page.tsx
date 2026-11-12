import { Settings as SettingsIcon } from "lucide-react";
import { getTenantContext } from "@/lib/data/tenant";
import { createClient } from "@/lib/supabase/server";
import { Phase3Settings } from "./_components/phase3-settings";
import { SettingsForms } from "./_components/settings-forms";

interface SettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { slug } = await params;

  // Instant in-memory cache hit from layout
  const { currentOrg: org, currentRole } = await getTenantContext(slug);

  const client = await createClient();
  const canManage = currentRole === "owner" || currentRole === "admin";
  const [policy, webhooks, deliveries] = await Promise.all([
    client.from("organization_sla_policies").select("*").eq("organization_id", org.id).maybeSingle(),
    canManage ? client.from("organization_webhooks").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    canManage ? client.from("webhook_deliveries").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
  ]);
  if (policy.error || webhooks.error || deliveries.error) throw new Error("Unable to load workspace settings.");
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Organization Settings
          </h1>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Manage workspace settings and administrative configuration for {org.name}.
        </p>
      </div>

      <Phase3Settings orgId={org.id} slug={slug} policy={policy.data} webhooks={webhooks.data || []} deliveries={deliveries.data || []} canManage={canManage}>
      <SettingsForms
        org={org}
        callerRole={currentRole}
      />
      </Phase3Settings>
    </div>
  );
}
