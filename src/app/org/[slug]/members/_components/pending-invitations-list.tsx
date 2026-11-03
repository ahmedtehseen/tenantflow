"use client";

import { useState, useTransition } from "react";
import {
  Mail,
  MailCheck,
  Clock,
  Copy,
  Check,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { revokeInvitationAction } from "../../../actions";
import { getInvitationUrl } from "@/lib/invitations/invitation-utils";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { RoleBadge } from "@/components/ui/role-badge";
import type { OrgRole, InvitationRole } from "@/types/database";

export interface PendingInvitationItem {
  id: string;
  email: string;
  role: InvitationRole;
  token: string;
  created_at: string;
  expires_at: string;
}

interface PendingInvitationsListProps {
  orgId: string;
  orgSlug: string;
  callerRole: OrgRole;
  invitations: PendingInvitationItem[];
}

export function PendingInvitationsList({
  orgId,
  orgSlug,
  callerRole,
  invitations,
}: PendingInvitationsListProps) {
  const [invitationToRevoke, setInvitationToRevoke] =
    useState<PendingInvitationItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canRevoke = callerRole === "owner" || callerRole === "admin";

  const handleCopy = async (token: string, id: string) => {
    try {
      const url = getInvitationUrl(token);
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleConfirmRevoke = () => {
    if (!invitationToRevoke) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeInvitationAction(
        invitationToRevoke.id,
        orgId,
        orgSlug,
      );
      if (res?.error) {
        setError(res.error);
      } else {
        setInvitationToRevoke(null);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pending Invitations ({invitations.length})
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Clock className="size-3.5" />
          <span>Expires in 7 days</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Invitations List / Empty State */}
      {invitations.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 mb-2.5">
            <MailCheck className="size-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            No pending invitations
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            All invited team members have joined or invitations have expired.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {invitations.map((inv) => {
            const createdDate = new Date(inv.created_at).toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              },
            );
            const expiresDate = new Date(inv.expires_at).toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              },
            );

            return (
              <div
                key={inv.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                {/* Email and Meta */}
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 font-medium text-xs shrink-0">
                    <Mail className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {inv.email}
                      </span>
                      <RoleBadge role={inv.role} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span suppressHydrationWarning>Sent {createdDate}</span>
                      <span>&middot;</span>
                      <span suppressHydrationWarning>
                        Expires {expiresDate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleCopy(inv.token, inv.id)}
                    title="Copy invitation link"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/80 transition cursor-pointer"
                  >
                    {copiedId === inv.id ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5 text-zinc-400" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  {canRevoke && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setInvitationToRevoke(inv)}
                      title="Revoke invitation"
                      className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-950/60 dark:text-red-400 dark:hover:bg-red-950/50 disabled:opacity-50 transition cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Revocation Confirmation Modal */}
      <ConfirmModal
        isOpen={!!invitationToRevoke}
        isLoading={isPending}
        title="Revoke invitation?"
        description={
          invitationToRevoke
            ? `Are you sure you want to revoke the invitation for ${invitationToRevoke.email}? This link will immediately stop working and cannot be used to join the workspace.`
            : ""
        }
        confirmText="Revoke Invitation"
        variant="danger"
        onConfirm={handleConfirmRevoke}
        onClose={() => {
          if (!isPending) setInvitationToRevoke(null);
        }}
      />
    </div>
  );
}
