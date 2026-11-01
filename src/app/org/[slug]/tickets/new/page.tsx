import { notFound, redirect } from "next/navigation";
import { Ticket as TicketIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateTicketForm } from "./ticket-form";
import type { MemberOption } from "../_components/ticket-list";

interface NewTicketPageProps {
  params: Promise<{ slug: string }>;
}

export default async function NewTicketPage({ params }: NewTicketPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/org/${slug}/tickets/new`);
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

  // 2. Fetch caller membership
  const { data: callerMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!callerMember) {
    notFound();
  }

  // 3. Fetch organization members for the assignee select
  const { data: membersData } = await supabase
    .from("organization_members")
    .select(`
      user_id,
      profiles (
        id,
        full_name,
        email
      )
    `)
    .eq("organization_id", org.id);

  const memberOptions: MemberOption[] = (membersData || [])
    .map((m) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!profile) return null;
      return {
        user_id: m.user_id,
        full_name: profile.full_name,
        email: profile.email,
      };
    })
    .filter((m): m is MemberOption => m !== null);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <TicketIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create New Ticket
          </h1>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          File a new work order, bug report, or operational task for {org.name}.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <CreateTicketForm
          orgId={org.id}
          orgSlug={org.slug}
          members={memberOptions}
        />
      </div>
    </div>
  );
}

