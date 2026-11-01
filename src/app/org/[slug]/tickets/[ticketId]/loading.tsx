export default function TicketDetailLoading() {
  return (
    <div className="space-y-6 max-w-4xl animate-pulse">
      {/* Back button skeleton */}
      <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />

      {/* Main card */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-2/3 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-40 rounded bg-zinc-100 dark:bg-zinc-850" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
          <div className="md:col-span-2 space-y-4">
            <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-28 w-full rounded-xl bg-zinc-100 dark:bg-zinc-850" />
          </div>

          <div className="space-y-4">
            <div className="h-9 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-9 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-9 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
