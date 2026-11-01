export default function MembersLoading() {
  return (
    <div className="space-y-8 max-w-4xl animate-pulse">
      {/* Header Skeleton */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-6 w-36 rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-3.5 w-72 rounded bg-zinc-100 dark:bg-zinc-850" />
      </div>

      {/* Add Member Box Skeleton */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-3">
        <div className="h-5 w-36 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3.5 w-64 rounded bg-zinc-100 dark:bg-zinc-850" />
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="h-9 flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-850" />
          <div className="h-9 w-28 rounded-lg bg-zinc-100 dark:bg-zinc-850" />
          <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Members List Skeleton */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-48 rounded bg-zinc-100 dark:bg-zinc-850" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-24 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                <div className="size-8 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
