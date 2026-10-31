import Link from "next/link";
import { Workflow } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Workflow className="size-5" aria-hidden="true" />
        </span>
        TenantFlow
      </Link>
      <main className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </main>
    </div>
  );
}
