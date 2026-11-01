"use client";

import { useTransition, useState } from "react";
import {
  Trash2,
  Shield,
  ShieldAlert,
  User,
  Loader2,
  LogOut,
} from "lucide-react";
import {
  updateMemberRoleAction,
  removeMemberAction,
  leaveOrganizationAction,
} from "../../../actions";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Select } from "@/components/ui/select";
import type { OrgRole } from "@/types/database";

interface MemberRowProps {
  orgId: string;
  orgSlug: string;
  callerUserId: string;
  callerRole: OrgRole;
  member: {
    user_id: string;
    role: OrgRole;
    created_at: string;
    profile: {
      id: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  };
}

export function MemberRow({
  orgId,
  orgSlug,
  callerUserId,
  callerRole,
  member,
}: MemberRowProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const isSelf = member.user_id === callerUserId;
  const targetRole = member.role;

  // Determine permissions according to RLS policies
  const canModifyRole =
    !isSelf &&
    (callerRole === "owner" || (callerRole === "admin" && targetRole !== "owner"));

  const canRemove =
    isSelf ||
    callerRole === "owner" ||
    (callerRole === "admin" && targetRole !== "owner");

  const displayName =
    member.profile?.full_name || member.profile?.email || "Unknown Member";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const formattedDate = new Date(member.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as OrgRole;
    setError(null);
    startTransition(async () => {
      const res = await updateMemberRoleAction(
        orgId,
        orgSlug,
        member.user_id,
        newRole,
      );
      if (res?.error) {
        setError(res.error);
      }
    });
  };

  const handleConfirmRemoval = () => {
    setError(null);
    if (isSelf) {
      startTransition(async () => {
        const res = await leaveOrganizationAction(orgId);
        if (res?.error) {
          setError(res.error);
          setShowConfirm(false);
        }
      });
    } else {
      startTransition(async () => {
        const res = await removeMemberAction(orgId, orgSlug, member.user_id);
        if (res?.error) {
          setError(res.error);
        }
        setShowConfirm(false);
      });
    }
  };

  const renderRoleBadge = (role: OrgRole) => {
    switch (role) {
      case "owner":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
            <ShieldAlert className="size-3" />
            Owner
          </span>
        );
      case "admin":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
            <Shield className="size-3" />
            Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <User className="size-3" />
            Member
          </span>
        );
    }
  };

  return (
    <div className="py-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* User Identity */}
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-indigo-50 font-semibold text-xs text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300 shrink-0">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {displayName}
              </span>
              {isSelf && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  You
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
              <span>{member.profile?.email}</span>
              <span>&middot;</span>
              <span className="font-sans" suppressHydrationWarning>
                Joined {formattedDate}
              </span>
            </div>
          </div>
        </div>

        {/* Role & Actions */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {canModifyRole ? (
            <Select
              value={member.role}
              disabled={isPending}
              onChange={handleRoleChange}
              className="py-1 text-xs"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              {callerRole === "owner" && <option value="owner">Owner</option>}
            </Select>
          ) : (
            renderRoleBadge(member.role)
          )}

          {canRemove && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowConfirm(true)}
              title={isSelf ? "Leave organization" : "Remove member"}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                isSelf
                  ? "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  : "border-red-100 text-red-600 hover:bg-red-50 dark:border-red-950/60 dark:text-red-400 dark:hover:bg-red-950/50"
              }`}
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isSelf ? (
                <>
                  <LogOut className="size-3.5" />
                  Leave
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Remove
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Modern UI Confirmation Modal instead of browser alert */}
      <ConfirmModal
        isOpen={showConfirm}
        isLoading={isPending}
        title={isSelf ? "Leave organization?" : `Remove ${displayName}?`}
        description={
          isSelf
            ? "Are you sure you want to leave this organization? You will immediately lose access to its tickets, workspace, and resources."
            : `Are you sure you want to remove ${displayName}? Their profile will be removed from this workspace and any assigned tickets will be unlinked.`
        }
        confirmText={isSelf ? "Leave Organization" : "Remove Member"}
        variant={isSelf ? "warning" : "danger"}
        onConfirm={handleConfirmRemoval}
        onClose={() => setShowConfirm(false)}
      />
    </div>
  );
}

