"use client";

import { useWorkspaceMutation } from "@/components/workspace/workspace-provider";

import { useState, useTransition } from "react";
import { Circle, Clock, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { updateTicketStatusAction } from "../actions";
import type { TicketStatus } from "@/types/database";

interface TicketStatusBadgeProps {
  status: TicketStatus;
  ticketId?: string;
  orgId?: string;
  orgSlug?: string;
  isEditable?: boolean;
}

export function TicketStatusBadge({
  status,
  ticketId,
  orgId,
  orgSlug,
  isEditable = false,
}: TicketStatusBadgeProps) {
  const updateStatus = useWorkspaceMutation(updateTicketStatusAction);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const getStatusConfig = (s: TicketStatus) => {
    switch (s) {
      case "open":
        return {
          label: "Open",
          icon: Circle,
          classes:
            "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900/60",
        };
      case "in_progress":
        return {
          label: "In Progress",
          icon: Clock,
          classes:
            "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900/60",
        };
      case "resolved":
        return {
          label: "Resolved",
          icon: CheckCircle2,
          classes:
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60",
        };
      case "closed":
        return {
          label: "Closed",
          icon: XCircle,
          classes:
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  if (isEditable && ticketId && orgId && orgSlug) {
    const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newStatus = e.target.value as TicketStatus;
      startTransition(async () => {
        setError(null);
        try {
          const result = await updateStatus(ticketId, orgId, orgSlug, newStatus);
          if (result.error) setError(result.error);
        } catch {
          setError("Unable to update status. Try again.");
        }
      });
    };

    return (
      <div className="relative inline-flex items-center">
        {error && <span role="alert" className="mr-2 text-xs text-red-600 dark:text-red-400">{error}</span>}
        <select
          aria-label="Ticket status"
          value={status}
          disabled={isPending}
          onChange={handleStatusChange}
          className={`appearance-none cursor-pointer rounded-md border pl-2 pr-5 py-0.5 text-xs font-medium outline-none transition disabled:opacity-50 ${config.classes}`}
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-current opacity-60"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${config.classes}`}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}

