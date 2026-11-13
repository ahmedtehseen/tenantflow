"use client";

import Link from "next/link";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import { TicketList } from "./_components/ticket-list";

import { WorkspaceScreen } from "@/components/workspace/workspace-screen";
import type { TicketsData } from "@/lib/data/workspace";

export default function TicketsPage() {
  return (
    <WorkspaceScreen<TicketsData> screen={"tickets"}>
      {({ org, user, currentRole, profile, tickets, memberOptions }) => (
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
                Track, assign, and manage issues and work orders across{" "}
                {org.name}.
              </p>
            </div>

            <Link
              href={`/org/${org.slug}/tickets/new`}
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
          />
        </div>
      )}
    </WorkspaceScreen>
  );
}
