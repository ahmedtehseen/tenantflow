"use client";

import { Shield } from "lucide-react";
import { MemberRow } from "./member-row";
import type { OrgRole } from "@/types/database";

export interface MemberItem {
  user_id: string;
  role: OrgRole;
  created_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  } | Array<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  }> | null;
}

interface MemberListProps {
  orgId: string;
  orgSlug: string;
  callerUserId: string;
  callerRole: OrgRole;
  members: MemberItem[];
}

export function MemberList({
  orgId,
  orgSlug,
  callerUserId,
  callerRole,
  members,
}: MemberListProps) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Current Members ({members.length})
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Shield className="size-3.5 text-emerald-600" />
          <span>RLS Protected</span>
        </div>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {members.map((m) => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return (
            <MemberRow
              key={m.user_id}
              orgId={orgId}
              orgSlug={orgSlug}
              callerUserId={callerUserId}
              callerRole={callerRole}
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
  );
}
