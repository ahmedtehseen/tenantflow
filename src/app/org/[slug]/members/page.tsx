import { Users, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/data/tenant";
import { AddMemberForm } from "./_components/add-member-form";
import { MemberRow } from "./_components/member-row";

interface MembersPageProps {
  params: Promise<{ slug: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // Instant in-memory cache hit from layout
  const { user, currentOrg: org, currentRole } = await getTenantContext(slug);
  const canAddMembers = currentRole === "owner" || currentRole === "admin";

  // Fetch all organization members with profiles
  const { data: members } = await supabase
    .from("organization_members")
    .select(`
      user_id,
      role,
      created_at,
      profiles (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Users className="size-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Team & Members
          </h1>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Manage member access, roles, and permissions within {org.name}.
        </p>
      </div>

      {/* Add Member Form (Owners & Admins only) */}
      {canAddMembers && (
        <AddMemberForm
          orgId={org.id}
          orgSlug={org.slug}
          callerRole={currentRole}
        />
      )}

      {/* Members List */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Current Members ({members?.length ?? 0})
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Shield className="size-3.5 text-emerald-600" />
            <span>RLS Protected</span>
          </div>
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members?.map((m) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return (
              <MemberRow
                key={m.user_id}
                orgId={org.id}
                orgSlug={org.slug}
                callerUserId={user.id}
                callerRole={currentRole}
                member={{
                  user_id: m.user_id,
                  role: m.role,
                  created_at: m.created_at,
                  profile: profile ?? null,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
