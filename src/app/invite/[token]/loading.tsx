import { Workflow } from "lucide-react";

export default function InviteLoading() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="mb-8 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Workflow className="size-5" aria-hidden="true" />
        </span>
        TenantFlow
      </div>

      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 animate-pulse">
        <div className="text-center space-y-2 mb-6">
          <div className="mx-auto size-12 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-40 mx-auto rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-56 mx-auto rounded bg-zinc-100 dark:bg-zinc-850" />
        </div>

        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 space-y-3 dark:border-zinc-800/80 dark:bg-zinc-950/40">
          <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="mt-6 h-10 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
