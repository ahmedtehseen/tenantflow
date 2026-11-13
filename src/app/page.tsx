import { Suspense } from "react";
import Link from "next/link";
import {
  Workflow,
  LogIn,
  UserPlus,
  Building,
  ShieldCheck,
  LogOut,
  Plus,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/tenant";
import { SignOutForm } from "@/components/auth/sign-out-form";

async function UserStatus() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          <LogIn className="size-4" />
          Sign in
        </Link>
        <Link
          href="/signup"
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 transition-colors"
        >
          <UserPlus className="size-4" />
          Create account
        </Link>
      </div>
    );
  }

  // Parallel database queries for user profile & tenant memberships
  const supabase = await createClient();
  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, organizations(id, name, slug)")
      .eq("user_id", user.id),
  ]);

  const profile = profileResult.data;
  const memberships = membershipsResult.data;

  return (
    <div className="flex flex-col gap-6 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Authenticated
          </span>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {profile?.full_name || user.email}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            {user.email} &middot; ID: {user.id.slice(0, 8)}...
          </p>
        </div>
        <SignOutForm>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </SignOutForm>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Your Organizations
          </h3>
          <Link
            href="/org/new"
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            <Plus className="size-3.5" />
            New Organization
          </Link>
        </div>

        {memberships && memberships.length > 0 ? (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40">
            {memberships.map((m, idx) => {
              const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
              if (!org) return null;
              return (
                <li key={idx}>
                  <Link
                    href={`/org/${org.slug}`}
                    prefetch={true}
                    className="flex items-center justify-between p-3.5 text-sm hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition group rounded-lg"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-white shadow-2xs border border-zinc-200/60 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <Building className="size-3.5" />
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 block text-xs">
                          {org.name}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          {org.slug}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 capitalize">
                        {m.role}
                      </span>
                      <ArrowRight className="size-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 space-y-3">
            <p>No organization memberships yet.</p>
            <Link
              href="/org/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-indigo-500 transition"
            >
              <Plus className="size-3.5" />
              Create your first organization
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400 flex items-start gap-2">
        <ShieldCheck className="size-4 text-emerald-600 mt-0.5 shrink-0" />
        <span>
          Multi-tenant Row Level Security (RLS) is active. All database queries are automatically isolated to your tenant memberships.
        </span>
      </div>
    </div>
  );
}

function UserStatusSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 animate-pulse">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-6 w-44 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-850" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-28 rounded bg-zinc-100 dark:bg-zinc-850" />
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
              <div className="space-y-1">
                <div className="h-3 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-2.5 w-16 rounded bg-zinc-100 dark:bg-zinc-850" />
              </div>
            </div>
            <div className="h-5 w-14 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="flex flex-col items-center text-center max-w-xl mb-8">
        <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md mb-4">
          <Workflow className="size-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          TenantFlow
        </h1>
        <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
          Production-grade multi-tenant B2B operations engine powered by Next.js 16 and Supabase.
        </p>
      </div>

      {/* Dynamic session read inside Suspense boundary for Next.js 16 cache compliance */}
      <Suspense fallback={<UserStatusSkeleton />}>
        <UserStatus />
      </Suspense>
    </div>
  );
}
