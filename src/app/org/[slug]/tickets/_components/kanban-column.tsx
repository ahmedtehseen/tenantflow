"use client";

import { useState } from "react";
import { Circle, Clock, CheckCircle2, XCircle, Inbox } from "lucide-react";
import { KanbanCard } from "./kanban-card";
import type { TicketItem } from "./ticket-list";
import type { TicketStatus } from "@/types/database";

export interface KanbanColumnProps {
  status: TicketStatus;
  title: string;
  tickets: TicketItem[];
  orgSlug: string;
  onDrop: (ticketId: string, targetStatus: TicketStatus) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, ticket: TicketItem) => void;
  isOver?: boolean;
}

export function KanbanColumn({
  status,
  title,
  tickets,
  orgSlug,
  onDrop,
  onDragStart,
  isOver: propIsOver,
}: KanbanColumnProps) {
  const [localIsOver, setLocalIsOver] = useState(false);
  const isOver = propIsOver !== undefined ? propIsOver : localIsOver;

  const getColumnStyle = (colStatus: TicketStatus) => {
    switch (colStatus) {
      case "open":
        return {
          icon: Circle,
          accentBorder: "border-t-sky-500",
          countBadge:
            "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-900/60",
          hoverHighlight: "border-sky-400 bg-sky-50/30 dark:bg-sky-950/20",
        };
      case "in_progress":
        return {
          icon: Clock,
          accentBorder: "border-t-amber-500",
          countBadge:
            "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900/60",
          hoverHighlight: "border-amber-400 bg-amber-50/30 dark:bg-amber-950/20",
        };
      case "resolved":
        return {
          icon: CheckCircle2,
          accentBorder: "border-t-emerald-500",
          countBadge:
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60",
          hoverHighlight:
            "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20",
        };
      case "closed":
        return {
          icon: XCircle,
          accentBorder: "border-t-zinc-400 dark:border-t-zinc-600",
          countBadge:
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
          hoverHighlight: "border-zinc-400 bg-zinc-100/40 dark:bg-zinc-800/20",
        };
    }
  };

  const style = getColumnStyle(status);
  const StatusIcon = style.icon;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!localIsOver) {
      setLocalIsOver(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setLocalIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only deactivate if leaving the column drop zone container itself
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setLocalIsOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setLocalIsOver(false);

    try {
      const rawData = e.dataTransfer.getData("application/json");
      if (rawData) {
        const parsed = JSON.parse(rawData);
        if (parsed?.ticketId) {
          onDrop(parsed.ticketId, status);
          return;
        }
      }

      const textData = e.dataTransfer.getData("text/plain");
      if (textData) {
        onDrop(textData, status);
      }
    } catch (err) {
      console.error("Error reading dropped ticket data:", err);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col flex-1 min-w-[280px] max-w-full rounded-2xl border-t-4 border border-zinc-200/80 bg-zinc-50/70 p-3 shadow-2xs transition-colors duration-150 dark:border-zinc-800/80 dark:bg-zinc-950/40 ${
        style.accentBorder
      } ${isOver ? `${style.hoverHighlight} border-dashed ring-2 ring-indigo-500/30` : ""}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 pt-1 px-1">
        <div className="flex items-center gap-2">
          <StatusIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-xs font-bold tracking-wide uppercase text-zinc-700 dark:text-zinc-300">
            {title}
          </h3>
        </div>
        <span
          className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${style.countBadge}`}
        >
          {tickets.length}
        </span>
      </div>

      {/* Cards List / Drop Zone */}
      <div className="flex flex-col gap-2.5 flex-1 min-h-[160px]">
        {tickets.length > 0 ? (
          tickets.map((ticket) => (
            <KanbanCard
              key={ticket.id}
              ticket={ticket}
              orgSlug={orgSlug}
              onDragStart={onDragStart}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 rounded-xl border border-dashed border-zinc-200/90 py-8 px-4 text-center dark:border-zinc-800/90">
            <Inbox className="size-5 text-zinc-300 dark:text-zinc-600 mb-1" />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              No tickets
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
