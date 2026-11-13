"use client";

import { Users } from "lucide-react";
import { InviteMemberModal } from "./_components/invite-member-modal";
import { PendingInvitationsList } from "./_components/pending-invitations-list";
import { MemberList } from "./_components/member-list";

import { WorkspaceScreen } from "@/components/workspace/workspace-screen";
import type { MembersData } from "@/lib/data/workspace";

export default function MembersPage() {
  return (
    <WorkspaceScreen<MembersData> screen={"members"}>
      {({
        org,
        user,
        currentRole,
        canManageMembers,
        typedInvitations,
        members,
      }) => (
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
                Manage member access, invitations, and permissions within{" "}
                {org.name}.
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
      )}
    </WorkspaceScreen>
  );
}
