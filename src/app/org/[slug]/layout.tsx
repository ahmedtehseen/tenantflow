import { Suspense } from "react";
import Link from "next/link";
import { Workflow, LogOut, ShieldAlert } from "lucide-react";
import { getTenantContext } from "@/lib/data/tenant";
import { TenantSwitcher } from "./_components/tenant-switcher";
import { TenantNav } from "./_components/tenant-nav";

export const instant = false;

import { signOutAction } from "@/lib/auth/actions";

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function TenantLayout({
  children,
  params,
}: TenantLayoutProps) {
  const { slug } = await params;

  // Single request-memoized call: resolves user, memberships, current org & role
  const { user, currentOrg, currentRole, organizations, profile } =
    await getTenantContext(slug);

  if (!currentRole) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xs dark:border-red-900/50 dark:bg-zinc-900">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <ShieldAlert className="size-6" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You are not a member of <span className="font-semibold">{currentOrg.name}</span>. Row Level Security prevents access to this tenant.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Brand Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 hover:opacity-85 transition"
              title="TenantFlow Home"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                <Workflow className="size-4" />
              </div>
              <span className="hidden font-bold tracking-tight text-sm sm:inline-block">
                TenantFlow
              </span>
            </Link>

            <span className="text-zinc-300 dark:text-zinc-700 select-none">/</span>

            {/* Tenant Switcher Dropdown */}
            <TenantSwitcher
              currentOrg={currentOrg}
              currentRole={currentRole}
              organizations={organizations}
            />

            {/* Primary Tenant Navigation */}
            <div className="hidden md:flex ml-2">
              <TenantNav slug={slug} />
            </div>
          </div>

          {/* Right Header: User profile & Sign Out */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">
                {profile?.full_name || user.email}
              </span>
              <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[150px]">
                {user.email}
              </span>
            </div>

            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                className="flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition cursor-pointer"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden border-t border-zinc-100 px-4 py-2 dark:border-zinc-800/80 overflow-x-auto">
          <TenantNav slug={slug} />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <div className="h-64 flex items-center justify-center text-sm text-zinc-400 animate-pulse">
                Loading tenant workspace...
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
