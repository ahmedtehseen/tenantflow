import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/data/tenant";
import { InviteMemberModal } from "./_components/invite-member-modal";
import { PendingInvitationsList } from "./_components/pending-invitations-list";
import { MemberList } from "./_components/member-list";
import type { InvitationRole } from "@/types/database";

interface MembersPageProps {
  params: Promise<{ slug: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // Instant in-memory cache hit from layout
  const { user, currentOrg: org, currentRole } = await getTenantContext(slug);
  const canManageMembers = currentRole === "owner" || currentRole === "admin";

  const nowIso = new Date().toISOString();

  // Fetch active members and pending invitations in parallel (ADR 0002)
  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
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
      .order("created_at", { ascending: true }),

    canManageMembers
      ? supabase
          .from("organization_invitations")
          .select(`
            id,
            email,
            role,
            token,
            created_at,
            expires_at
          `)
          .eq("organization_id", org.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const typedInvitations = (invitations ?? []).map((inv) => ({
    ...inv,
    role: inv.role as InvitationRole,
  }));

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header & Invite Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Team & Members
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Manage member access, invitations, and permissions within {org.name}.
          </p>
        </div>

        {canManageMembers && (
          <InviteMemberModal
            orgId={org.id}
            orgSlug={org.slug}
            callerRole={currentRole}
          />
        )}
      </div>

      {/* Pending Invitations (Owners & Admins only) */}
      {canManageMembers && (
        <PendingInvitationsList
          orgId={org.id}
          orgSlug={org.slug}
          callerRole={currentRole}
          invitations={typedInvitations}
        />
      )}

      {/* Current Members List */}
      <MemberList
        orgId={org.id}
        orgSlug={org.slug}
        callerUserId={user.id}
        callerRole={currentRole}
        members={members ?? []}
      />
    </div>
  );
}
