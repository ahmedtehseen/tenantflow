"use client";

import { useSWRConfig } from "swr";
import type { WorkspaceData } from "@/lib/data/workspace";
import { applySavedOrganization } from "#workspace/saved-data";

import {
  useWorkspaceDraft,
  useWorkspaceMutation,
} from "@/components/workspace/workspace-provider";

import { useActionState, useState } from "react";
import {
  Building2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  updateOrganizationAction,
  deleteOrganizationAction,
  type ActionState,
} from "../../../actions";
import type { OrgRole } from "@/types/database";

interface SettingsFormsProps {
  org: {
    id: string;
    name: string;
    slug: string;
  };
  callerRole: OrgRole;
}

const initialState: ActionState = {};

export function SettingsForms({ org, callerRole }: SettingsFormsProps) {
  const { mutate } = useSWRConfig();
  const [name, setName, resetName] = useWorkspaceDraft(
    "settings:name",
    org.name,
  );
  const [confirmation, setConfirmation] = useState("");

  const canEdit = callerRole === "owner" || callerRole === "admin";
  const isOwner = callerRole === "owner";

  // Bound actions
  const boundUpdateAction = useWorkspaceMutation(
    async (previous: ActionState | null, data: FormData) => {
      const result = await updateOrganizationAction(
        org.id,
        org.slug,
        previous,
        data,
      );
      if (result.organization) {
        const savedOrganization = result.organization;
        await mutate(
          () => true,
          (current: WorkspaceData | undefined) =>
            applySavedOrganization(current, savedOrganization),
          { revalidate: false },
        );
      }
      return result;
    },
  );
  const [updateState, updateFormAction, isUpdatePending] = useActionState(
    async (previous: ActionState | null, data: FormData) => {
      const result = await boundUpdateAction(previous, data);
      if (result.organization) {
        resetName();
      }
      return result;
    },
    initialState,
  );

  const boundDeleteAction = useWorkspaceMutation(
    deleteOrganizationAction.bind(null, org.id, org.slug),
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    boundDeleteAction,
    initialState,
  );

  return (
    <div className="space-y-8 max-w-2xl">
      {/* General Settings */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="size-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            General Details
          </h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
          Update the display name of your organization.
        </p>

        {updateState?.error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{updateState.error}</span>
          </div>
        )}

        {updateState?.success && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <span>{updateState.success}</span>
          </div>
        )}

        <form action={updateFormAction} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Organization Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              disabled={!canEdit || isUpdatePending}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs text-zinc-900 shadow-2xs outline-none transition focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-950"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="slug-display"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Organization Slug (Identifier)
            </label>
            <input
              id="slug-display"
              type="text"
              readOnly
              disabled
              value={org.slug}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2 font-mono text-xs text-zinc-500 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 select-all cursor-not-allowed"
            />
            <p className="text-[11px] text-zinc-400">
              Slugs serve as unique tenant keys in URLs and cannot be modified.
            </p>
          </div>

          {canEdit && (
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isUpdatePending || name.trim() === org.name}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isUpdatePending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Danger Zone */}
      {isOwner ? (
        <div className="rounded-2xl border border-red-200/80 bg-red-50/20 p-6 dark:border-red-900/50 dark:bg-red-950/10">
          <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="size-4" />
            <h2 className="text-sm font-semibold">Danger Zone</h2>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4">
            Deleting an organization permanently removes all memberships,
            tickets, and operational data. This action is irreversible.
          </p>

          {deleteState?.error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{deleteState.error}</span>
            </div>
          )}

          <form action={deleteFormAction} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="confirmation"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Type{" "}
                <span className="font-mono font-bold text-red-600 dark:text-red-400">
                  {org.slug}
                </span>{" "}
                to confirm
              </label>
              <input
                id="confirmation"
                name="confirmation"
                type="text"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={org.slug}
                className="w-full rounded-lg border border-red-200 bg-white px-3.5 py-2 font-mono text-xs text-zinc-900 shadow-2xs outline-none transition focus:border-red-600 dark:border-red-900/60 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={isDeletePending || confirmation !== org.slug}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isDeletePending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Delete this organization
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50 p-6 text-xs text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
          Only organization owners can delete this tenant or access destruction
          controls.
        </div>
      )}
    </div>
  );
}
