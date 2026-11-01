export default function TicketsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="size-5 rounded-md bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-6 w-28 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-3.5 w-64 rounded bg-zinc-100 dark:bg-zinc-850" />
        </div>

        <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900"
          >
            <div className="h-3 w-16 rounded bg-zinc-100 dark:bg-zinc-850" />
            <div className="mt-2 h-7 w-12 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ))}
      </div>

      {/* Filter Bar Skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-9 w-full sm:w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Ticket Rows Skeleton */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-5 w-14 rounded-md bg-zinc-100 dark:bg-zinc-850" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-850" />
                <div className="h-3 w-28 rounded bg-zinc-100 dark:bg-zinc-850" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-6 w-20 rounded-md bg-zinc-100 dark:bg-zinc-800" />
              <div className="size-6 rounded bg-zinc-100 dark:bg-zinc-850" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

