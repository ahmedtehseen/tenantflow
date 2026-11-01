import { Settings as SettingsIcon } from "lucide-react";
import { getTenantContext } from "@/lib/data/tenant";
import { SettingsForms } from "./_components/settings-forms";

interface SettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { slug } = await params;

  // Instant in-memory cache hit from layout
  const { currentOrg: org, currentRole } = await getTenantContext(slug);

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

      <SettingsForms
        org={org}
        callerRole={currentRole}
      />
    </div>
  );
}
