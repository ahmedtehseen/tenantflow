import Link from "next/link";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/data/tenant";
import { TicketList, type TicketItem, type MemberOption } from "./_components/ticket-list";
import { resolveViewMode } from "@/lib/tickets/view-mode";

interface TicketsPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ view?: string }>;
}

export default async function TicketsPage({ params, searchParams }: TicketsPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialView = resolveViewMode(resolvedSearchParams?.view);
  const supabase = await createClient();

  // Instant in-memory cache hit from layout
  const { user, currentOrg: org, currentRole, profile } = await getTenantContext(slug);

  // Parallel database queries for members & tickets
  const [membersResult, ticketsResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select(`
        user_id,
        profiles (
          id,
          full_name,
          email
        )
      `)
      .eq("organization_id", org.id),
    supabase
      .from("tickets")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
  ]);

  const membersData = membersResult.data || [];
  const rawTickets = ticketsResult.data || [];

  const memberMap = new Map<string, { id: string; full_name: string | null; email: string }>();
  const memberOptions: MemberOption[] = [];

  membersData.forEach((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p) {
      memberMap.set(m.user_id, {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
      });
      memberOptions.push({
        user_id: m.user_id,
        full_name: p.full_name,
        email: p.email,
      });
    }
  });

  const tickets: TicketItem[] = rawTickets.map((t) => ({
    ...t,
    creator: t.created_by ? memberMap.get(t.created_by) ?? null : null,
    assignee: t.assigned_to ? memberMap.get(t.assigned_to) ?? null : null,
  }));

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TicketIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Operational Tickets
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Track, assign, and manage issues and work orders across {org.name}.
          </p>
        </div>

        <Link
          href={`/org/${slug}/tickets/new`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 transition self-start sm:self-auto"
        >
          <Plus className="size-3.5" />
          <span>Create Ticket</span>
        </Link>
      </div>

      {/* Ticket List with Filters, Search, Presence, and Kanban View Switcher */}
      <TicketList
        tickets={tickets}
        members={memberOptions}
        orgId={org.id}
        orgSlug={org.slug}
        callerUserId={user.id}
        callerRole={currentRole}
        callerEmail={user.email || profile?.email || ""}
        callerName={profile?.full_name ?? null}
        initialView={initialView}
      />
    </div>
  );
}
