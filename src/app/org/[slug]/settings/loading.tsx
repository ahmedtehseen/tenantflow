export default function SettingsLoading() {
  return (
    <div className="space-y-8 max-w-3xl animate-pulse">
      {/* Header Skeleton */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-6 w-44 rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-3.5 w-80 rounded bg-zinc-100 dark:bg-zinc-850" />
      </div>

      {/* General Settings Card Skeleton */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-4">
        <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3.5 w-60 rounded bg-zinc-100 dark:bg-zinc-850" />
        <div className="space-y-3 pt-2">
          <div className="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-850" />
          <div className="h-9 w-full rounded-lg bg-zinc-100 dark:bg-zinc-850" />
          <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Danger Zone Skeleton */}
      <div className="rounded-2xl border border-red-200/60 bg-white p-6 shadow-2xs dark:border-red-950/40 dark:bg-zinc-900 space-y-4">
        <div className="h-5 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3.5 w-72 rounded bg-zinc-100 dark:bg-zinc-850" />
        <div className="h-9 w-36 rounded-lg bg-red-100 dark:bg-red-950/60" />
      </div>
    </div>
  );
}

