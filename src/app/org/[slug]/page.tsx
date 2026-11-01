import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Users,
  Ticket,
  ShieldCheck,
  ArrowRight,
  Plus,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface TenantDashboardPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantDashboardPage({
  params,
}: TenantDashboardPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // 1. Get current organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at, created_by")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    notFound();
  }

  // 2. Fetch members count & preview
  const { data: members, count: memberCount } = await supabase
    .from("organization_members")
    .select("role, created_at, profiles(id, full_name, email)", {
      count: "exact",
    })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true })
    .limit(5);

  // 3. Fetch tickets count
  const { count: ticketCount } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);

  const formattedDate = new Date(org.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Welcome / Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {org.name}
            </h1>
            <span className="font-mono text-xs rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {org.slug}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Calendar className="size-3.5" />
              Created {formattedDate}
            </span>
            <span>&middot;</span>
            <span className="font-mono">ID: {org.id.slice(0, 8)}...</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/org/${slug}/members`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
          >
            <Users className="size-3.5" />
            Manage Team
          </Link>
          <Link
            href={`/org/${slug}/tickets`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 transition"
          >
            <Plus className="size-3.5" />
            New Ticket
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Members Card */}
        <Link
          href={`/org/${slug}/members`}
          className="group rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs hover:border-indigo-200 hover:shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-indigo-900/50 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Team Members
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {memberCount ?? 0}
            </span>
            <span className="flex items-center text-xs font-medium text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
              View team <ArrowRight className="size-3.5 ml-1" />
            </span>
          </div>
        </Link>

        {/* Tickets Card */}
        <Link
          href={`/org/${slug}/tickets`}
          className="group rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs hover:border-indigo-200 hover:shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-indigo-900/50 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Active Tickets
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              <Ticket className="size-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {ticketCount ?? 0}
            </span>
            <span className="flex items-center text-xs font-medium text-sky-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform">
              View tickets <ArrowRight className="size-3.5 ml-1" />
            </span>
          </div>
        </Link>

        {/* Security / RLS Card */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Tenant Isolation
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              RLS Enforced
            </span>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              PostgreSQL policies partition tickets and member records to this tenant.
            </p>
          </div>
        </div>
      </div>

      {/* Team Preview Section */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Team Preview
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Colleagues with access to this tenant workspace.
            </p>
          </div>
          <Link
            href={`/org/${slug}/members`}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 flex items-center gap-1"
          >
            Manage all ({memberCount ?? 0})
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {members?.map((m, idx) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            const displayName = profile?.full_name || profile?.email || "Unknown Member";
            const initials = displayName
              .split(" ")
              .map((w: string) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <li
                key={idx}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0 text-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-indigo-50 font-semibold text-xs text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    {initials}
                  </div>
                  <div>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 block text-xs">
                      {displayName}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {profile?.email}
                    </span>
                  </div>
                </div>

                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 capitalize dark:bg-zinc-800 dark:text-zinc-300">
                  {m.role}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
