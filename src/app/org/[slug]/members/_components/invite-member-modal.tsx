"use client";

import { useState, useEffect, useRef, useActionState } from "react";
import {
  UserPlus,
  X,
  Mail,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Shield,
  User,
  Link as LinkIcon,
} from "lucide-react";
import { createInvitationAction, type ActionState } from "../../../actions";
import { getInvitationUrl } from "@/lib/invitations/invitation-utils";
import type { OrgRole, InvitationRole } from "@/types/database";

interface InviteMemberModalProps {
  orgId: string;
  orgSlug: string;
  callerRole: OrgRole;
}

type InviteActionState = ActionState & { invitationToken?: string };

const initialActionState: InviteActionState = {};

export function InviteMemberModal({
  orgId,
  orgSlug,
}: InviteMemberModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleOpen = () => {
    setFormKey((k) => k + 1);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 transition cursor-pointer shrink-0"
      >
        <UserPlus className="size-3.5" />
        <span>Invite Member</span>
      </button>

      {isOpen && (
        <InviteDialog
          key={formKey}
          orgId={orgId}
          orgSlug={orgSlug}
          onClose={handleClose}
          onInviteAnother={() => setFormKey((k) => k + 1)}
        />
      )}
    </>
  );
}

interface InviteDialogProps {
  orgId: string;
  orgSlug: string;
  onClose: () => void;
  onInviteAnother: () => void;
}

function InviteDialog({
  orgId,
  orgSlug,
  onClose,
  onInviteAnother,
}: InviteDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationRole>("member");
  const [copied, setCopied] = useState(false);

  const boundAction = createInvitationAction.bind(null, orgId, orgSlug);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialActionState,
  );

  // Autofocus email input on mount
  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  // Keyboard accessibility: Escape to close modal
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPending, onClose]);

  const handleCopyLink = async () => {
    if (!state.invitationToken) return;
    try {
      const fullUrl = getInvitationUrl(state.invitationToken);
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const displayInviteLink = state.invitationToken
    ? getInvitationUrl(state.invitationToken)
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0">
              <UserPlus className="size-5" />
            </div>
            <div>
              <h2
                id="invite-modal-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Invite Team Member
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Send an invitation to join your workspace.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Success View */}
        {state?.invitationToken ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-medium text-sm">
                <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Invitation Ready!</span>
              </div>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                An invitation token has been generated for{" "}
                <span className="font-semibold">{email}</span>. Share the link below
                to allow them to join as a <span className="capitalize">{role}</span>.
              </p>
            </div>

            {/* Link Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Invitation Link (Valid for 7 days)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 font-mono select-all dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 overflow-x-auto">
                  <LinkIcon className="size-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{displayInviteLink}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 transition cursor-pointer shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-200" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onInviteAnother}
                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/80 transition cursor-pointer"
              >
                Invite Another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form action={formAction} className="mt-5 space-y-4">
            {state?.error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{state.error}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="invite-email"
                className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                <input
                  ref={emailInputRef}
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white pl-9.5 pr-3.5 py-2 text-xs text-zinc-900 shadow-2xs outline-none transition placeholder:text-zinc-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Role Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Workspace Role
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRole("member")}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition cursor-pointer ${
                    role === "member"
                      ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/40"
                      : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-xs text-zinc-900 dark:text-zinc-100">
                    <User className="size-3.5 text-zinc-500" />
                    <span>Member</span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                    Collaborate on assigned tickets and view resources
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("admin")}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition cursor-pointer ${
                    role === "admin"
                      ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/40"
                      : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-xs text-zinc-900 dark:text-zinc-100">
                    <Shield className="size-3.5 text-indigo-500" />
                    <span>Admin</span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                    Manage team, invite members, and administer settings
                  </p>
                </button>
              </div>
              <input type="hidden" name="role" value={role} />
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                disabled={isPending}
                onClick={onClose}
                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/80 disabled:opacity-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !email.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-600/30 transition cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Creating Invitation...
                  </>
                ) : (
                  <>
                    <UserPlus className="size-3.5" />
                    Send Invitation
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
