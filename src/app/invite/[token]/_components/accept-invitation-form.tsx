"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { acceptInvitationAction } from "@/app/org/actions";

interface AcceptInvitationFormProps {
  token: string;
  orgSlug: string;
}

export function AcceptInvitationForm({
  token,
  orgSlug,
}: AcceptInvitationFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvitationAction(token);
      if (res?.error) {
        setError(res.error);
      } else {
        const destination = res?.orgSlug ? `/org/${res.orgSlug}` : `/org/${orgSlug}`;
        router.push(destination);
        router.refresh();
      }
    });
  };

  return (
    <div className="w-full space-y-3">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={handleAccept}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>Joining Workspace...</span>
          </>
        ) : (
          <>
            <span>Join Workspace</span>
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </div>
  );
}
