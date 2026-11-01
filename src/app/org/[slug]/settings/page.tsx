import { notFound, redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SettingsForms } from "./_components/settings-forms";
import type { OrgRole } from "@/types/database";

interface SettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/org/${slug}/settings`);
  }

  // 1. Fetch organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    notFound();
  }

  // 2. Fetch caller's role
  const { data: callerMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!callerMember) {
    notFound();
  }

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
        callerRole={callerMember.role as OrgRole}
      />
    </div>
  );
}

