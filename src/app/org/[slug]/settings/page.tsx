"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { Phase3Settings } from "./_components/phase3-settings";
import { SettingsForms } from "./_components/settings-forms";

import { WorkspaceScreen } from "@/components/workspace/workspace-screen";
import type { SettingsData } from "@/lib/data/workspace";

export default function SettingsPage() {
  return (
    <WorkspaceScreen<SettingsData> screen={"settings"}>
      {({ org, currentRole, canManage, policy, webhooks, deliveries }) => (
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2">
              <SettingsIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Organization Settings
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Manage workspace settings and administrative configuration for{" "}
              {org.name}.
            </p>
          </div>

          <Phase3Settings
            orgId={org.id}
            slug={org.slug}
            policy={policy}
            webhooks={webhooks}
            deliveries={deliveries}
            canManage={canManage}
          >
            <SettingsForms org={org} callerRole={currentRole} />
          </Phase3Settings>
        </div>
      )}
    </WorkspaceScreen>
  );
}
