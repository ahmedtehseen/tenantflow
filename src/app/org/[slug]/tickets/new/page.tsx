"use client";

import { Ticket as TicketIcon } from "lucide-react";
import { CreateTicketForm } from "./ticket-form";
import { WorkspaceScreen } from "@/components/workspace/workspace-screen";
import type { TicketsData } from "@/lib/data/workspace";

export default function NewTicketPage() {
  return (
    <WorkspaceScreen<TicketsData> screen="tickets">
      {({ org, memberOptions }) => (
        <div className="max-w-3xl space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <TicketIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Create New Ticket
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              File a new work order, bug report, or operational task for{" "}
              {org.name}.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
            <CreateTicketForm
              orgId={org.id}
              orgSlug={org.slug}
              members={memberOptions}
            />
          </div>
        </div>
      )}
    </WorkspaceScreen>
  );
}
