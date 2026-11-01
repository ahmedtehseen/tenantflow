"use client";

import { useActionState, useState } from "react";
import { UserPlus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { addMemberAction, type ActionState } from "../../../actions";
import { Select } from "@/components/ui/select";
import type { OrgRole } from "@/types/database";

interface AddMemberFormProps {
  orgId: string;
  orgSlug: string;
  callerRole: OrgRole;
}

const initialState: ActionState = {};

export function AddMemberForm({
  orgId,
  orgSlug,
  callerRole,
}: AddMemberFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");

  // Bind orgId and orgSlug to action
  const boundAction = addMemberAction.bind(null, orgId, orgSlug);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-2">
        <UserPlus className="size-4 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add Team Member
        </h3>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        Add an existing registered user to this organization by their email address.
      </p>

      {state?.error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {state?.success && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          <span>{state.success}</span>
        </div>
      )}

      <form action={formAction} className="flex flex-col sm:flex-row gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs text-zinc-900 shadow-2xs outline-none transition placeholder:text-zinc-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />

        <Select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as OrgRole)}
          className="py-2 text-xs"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          {callerRole === "owner" && <option value="owner">Owner</option>}
        </Select>

        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <UserPlus className="size-3.5" />
              Add Member
            </>
          )}
        </button>
      </form>
    </div>
  );
}

