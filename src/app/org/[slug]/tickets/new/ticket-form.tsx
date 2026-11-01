"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowLeft, Plus } from "lucide-react";
import { createTicketAction, type TicketActionState } from "../actions";
import type { MemberOption } from "../_components/ticket-list";

interface CreateTicketFormProps {
  orgId: string;
  orgSlug: string;
  members: MemberOption[];
}

const initialState: TicketActionState = {};

export function CreateTicketForm({
  orgId,
  orgSlug,
  members,
}: CreateTicketFormProps) {
  const boundAction = createTicketAction.bind(null, orgId, orgSlug);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <label
          htmlFor="title"
          className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          autoFocus
          maxLength={200}
          placeholder="e.g. Elevators maintenance inspection in Building B"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 shadow-2xs outline-none transition placeholder:text-zinc-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Priority, Status & Assignee Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Priority */}
        <div className="space-y-1.5">
          <label
            htmlFor="priority"
            className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue="medium"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-2xs outline-none transition hover:bg-zinc-50 focus:border-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <label
            htmlFor="status"
            className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Initial Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue="open"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-2xs outline-none transition hover:bg-zinc-50 focus:border-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Assignee */}
        <div className="space-y-1.5">
          <label
            htmlFor="assigned_to"
            className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Assignee
          </label>
          <select
            id="assigned_to"
            name="assigned_to"
            defaultValue=""
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-2xs outline-none transition hover:bg-zinc-50 focus:border-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          placeholder="Detailed description of the issue, requirement, or operational task..."
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 shadow-2xs outline-none transition placeholder:text-zinc-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Form Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <Link
          href={`/org/${orgSlug}/tickets`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition"
        >
          <ArrowLeft className="size-3.5" />
          Cancel and return to tickets
        </Link>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Creating ticket...
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Create Ticket
            </>
          )}
        </button>
      </div>
    </form>
  );
}

