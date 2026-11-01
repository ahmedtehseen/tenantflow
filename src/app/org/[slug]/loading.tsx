export default function TenantDashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-5 w-16 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-4 w-36 rounded bg-zinc-100 dark:bg-zinc-850" />
        </div>

        <div className="flex items-center gap-3">
          <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <div className="size-10 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              <div className="size-4 rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-8 w-16 rounded-md bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 w-28 rounded bg-zinc-100 dark:bg-zinc-850" />
              <div className="h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-850" />
            </div>
          </div>
        ))}
      </div>

      {/* Team Preview Skeleton */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div className="space-y-1">
            <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3.5 w-48 rounded bg-zinc-100 dark:bg-zinc-850" />
          </div>
          <div className="h-4 w-16 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-44 rounded bg-zinc-100 dark:bg-zinc-850" />
                </div>
              </div>
              <div className="h-5 w-16 rounded-md bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
