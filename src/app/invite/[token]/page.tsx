import type { Metadata } from "next";
import Link from "next/link";
import {
  Workflow,
  Building2,
  AlertCircle,
  User,
  LogIn,
  UserPlus,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/data/tenant";
import { isInvitationActive } from "@/lib/invitations/invitation-utils";
import { RoleBadge } from "@/components/ui/role-badge";
import { AcceptInvitationForm } from "./_components/accept-invitation-form";
import type { OrgRole } from "@/types/database";

export const metadata: Metadata = {
  title: "Join Workspace · TenantFlow",
  description: "Accept your invitation to join an organization on TenantFlow.",
};

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const trimmedToken = token?.trim() ?? "";

  // Query invitation via admin client to bypass tenant-isolation boundaries for recipient onboarding (ADR 0002)
  const adminClient = createAdminClient();
  const { data: invitation } = await adminClient
    .from("organization_invitations")
    .select(`
      id,
      organization_id,
      email,
      role,
      token,
      created_at,
      expires_at,
      accepted_at,
      revoked_at,
      organizations (
        id,
        name,
        slug
      ),
      inviter:profiles!invited_by (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq("token", trimmedToken)
    .maybeSingle();

  const isInvalid = !invitation || !isInvitationActive(invitation);

  // Check current authentication state
  const currentUser = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      {/* Brand Header */}
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Workflow className="size-5" aria-hidden="true" />
        </span>
        TenantFlow
      </Link>

      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {isInvalid ? (
          /* Invalid or Expired Invitation Card */
          <div className="text-center space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <AlertCircle className="size-6" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Invalid or Expired Invitation
              </h1>
              <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                This invitation link is invalid, has expired, or has already been accepted or revoked.
                If you were expecting access to this workspace, please ask your organization administrator
                to send a new invitation.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
              >
                Return to Home
              </Link>
            </div>
          </div>
        ) : (
          (() => {
            const org = Array.isArray(invitation.organizations)
              ? invitation.organizations[0]
              : invitation.organizations;

            const inviter = Array.isArray(invitation.inviter)
              ? invitation.inviter[0]
              : invitation.inviter;

            const inviterDisplayName =
              inviter?.full_name || inviter?.email || "Workspace Administrator";

            if (!org || !org.slug) {
              return (
                <div className="text-center space-y-4">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                    <AlertCircle className="size-6" />
                  </div>
                  <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                    Organization Not Found
                  </h1>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    The organization associated with this invitation is no longer active.
                  </p>
                  <Link
                    href="/"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
                  >
                    Return to Home
                  </Link>
                </div>
              );
            }

            const formattedExpiry = new Date(invitation.expires_at).toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              },
            );

            return (
              <div className="space-y-6">
                {/* Org Identity & Invite Header */}
                <div className="text-center space-y-2">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <Building2 className="size-6" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                      Join {org.name}
                    </h1>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      You have been invited to collaborate in this workspace.
                    </p>
                  </div>
                </div>

                {/* Invitation Details Summary */}
                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 space-y-3 dark:border-zinc-800/80 dark:bg-zinc-950/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Organization</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {org.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Invited By</span>
                    <div className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                      <User className="size-3.5 text-zinc-400" />
                      <span>{inviterDisplayName}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Offered Role</span>
                    <RoleBadge role={invitation.role as OrgRole} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Invited Email</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {invitation.email}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Valid Until</span>
                    <span className="text-zinc-700 dark:text-zinc-300" suppressHydrationWarning>
                      {formattedExpiry}
                    </span>
                  </div>
                </div>

                {/* Conditional Auth State: Unauthenticated vs Authenticated */}
                {!currentUser ? (
                  /* Unauthenticated State */
                  <div className="space-y-3">
                    <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Sign in or create an account to accept your invitation and join {org.name}.
                    </p>

                    <div className="space-y-2 pt-1">
                      <Link
                        href={`/login?next=${encodeURIComponent(`/invite/${trimmedToken}`)}`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 transition"
                      >
                        <LogIn className="size-3.5" />
                        <span>Sign in to accept</span>
                      </Link>

                      <Link
                        href={`/signup?next=${encodeURIComponent(`/invite/${trimmedToken}`)}`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700/80 transition"
                      >
                        <UserPlus className="size-3.5" />
                        <span>Create account to accept</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* Authenticated State */
                  <div className="space-y-4">
                    <div className="rounded-lg bg-zinc-100/70 p-3 text-xs dark:bg-zinc-800/50">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 dark:text-zinc-400">Signed in as:</span>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {currentUser.email}
                        </span>
                      </div>
                      {currentUser.email?.toLowerCase() !== invitation.email.toLowerCase() && (
                        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 leading-tight">
                          Note: This invite was sent to {invitation.email}. You will join as {currentUser.email}.
                        </p>
                      )}
                    </div>

                    <AcceptInvitationForm token={trimmedToken} orgSlug={org.slug} />

                    <div className="text-center pt-2">
                      <Link
                        href={`/login?next=${encodeURIComponent(`/invite/${trimmedToken}`)}`}
                        className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
                      >
                        Sign in as a different user
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </main>
    </div>
  );
}
