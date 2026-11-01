"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { createOrganizationAction, type ActionState } from "../actions";

const initialState: ActionState = {};

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateOrganizationForm() {
  const [state, formAction, isPending] = useActionState(
    createOrganizationAction,
    initialState,
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isSlugManuallyEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugManuallyEdited(true);
    setSlug(slugify(e.target.value));
  };

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <p>{state.error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Organization Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          value={name}
          onChange={handleNameChange}
          placeholder="e.g. Acme Corp"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-xs outline-none transition placeholder:text-zinc-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-indigo-500"
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          The public display name for your team or company.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="slug"
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Organization URL Slug
        </label>
        <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <span className="font-mono text-xs select-none">tenantflow.com/org/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={slug}
            onChange={handleSlugChange}
            placeholder="acme-corp"
            className="flex-1 bg-transparent px-1 font-mono text-sm font-medium text-zinc-900 outline-none dark:text-zinc-100"
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Used in dashboard URLs. Only lowercase letters, numbers, and hyphens.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <Link
          href="/"
          className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending || !name.trim() || !slug.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create Organization
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
