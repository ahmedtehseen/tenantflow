"use client";

import { SLAChip } from "@/components/sla/sla-chip";
import { useState } from "react";
import Link from "next/link";
import { UserMinus, Calendar } from "lucide-react";
import { TicketPriorityBadge } from "./ticket-priority-badge";
import type { TicketItem } from "./ticket-list";

export interface KanbanCardProps {
  ticket: TicketItem;
  orgSlug: string;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, ticket: TicketItem) => void;
}

export function KanbanCard({ ticket, orgSlug, onDragStart }: KanbanCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const assigneeName =
    ticket.assignee?.full_name || ticket.assignee?.email || null;
  const assigneeInitials = (
    assigneeName ? assigneeName.charAt(0) : "U"
  ).toUpperCase();

  const formattedDate = new Date(ticket.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragging(true);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        ticketId: ticket.id,
        currentStatus: ticket.status,
      }),
    );
    e.dataTransfer.setData("text/plain", ticket.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(e, ticket);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      tabIndex={0}
      role="button"
      aria-label={`Ticket ${ticket.title}, status ${ticket.status}, priority ${ticket.priority}`}
      className={`group relative rounded-xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs transition-all duration-150 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/90 dark:hover:border-zinc-700 dark:hover:shadow-black/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
        isDragging ? "opacity-50 scale-[0.98] ring-2 ring-indigo-500/40" : "opacity-100"
      }`}
    >
      {/* Header: Title and Priority Badge */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/org/${orgSlug}/tickets/${ticket.id}`}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-semibold text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400 line-clamp-2 transition-colors break-words flex-1"
        >
          {ticket.title}
        </Link>
        <div className="shrink-0">
          <TicketPriorityBadge priority={ticket.priority} />
        </div>
      </div>

      {/* Description Snippet (clamped 2 lines) */}
      {ticket.description && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
          {ticket.description}
        </p>
      )}

      <div className="mt-2"><SLAChip ticket={ticket} /></div>

      {/* Footer: Assignee & Created Date */}
      <div className="mt-3.5 flex items-center justify-between gap-2 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/60 text-xs">
        {/* Assignee Avatar / Name or Unassigned */}
        {assigneeName ? (
          <div className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 min-w-0">
            <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
              {assigneeInitials}
            </div>
            <span className="truncate max-w-[110px]">{assigneeName}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700">
            <UserMinus className="size-3" />
            Unassigned
          </span>
        )}

        {/* Date relative / compact */}
        <div
          className="flex items-center gap-1 text-[11px] text-zinc-400 shrink-0"
          suppressHydrationWarning
        >
          <Calendar className="size-3" />
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
