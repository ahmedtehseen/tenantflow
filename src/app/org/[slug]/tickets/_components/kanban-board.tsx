"use client";

import { useState, useCallback } from "react";
import { AlertCircle, X } from "lucide-react";
import { KanbanColumn } from "./kanban-column";
import {
  canTransitionTicket,
  type TicketLifecycleTarget,
  type TicketActorContext,
  type TransitionEvaluation,
} from "@/lib/tickets/lifecycle";
import type { TicketItem, MemberOption } from "./ticket-list";
import type { TicketStatus, OrgRole } from "@/types/database";

export interface KanbanBoardProps {
  tickets: TicketItem[];
  members: MemberOption[];
  orgId: string;
  orgSlug: string;
  callerUserId: string;
  callerRole: OrgRole;
  onStatusChange: (
    ticketId: string,
    nextStatus: TicketStatus,
  ) => Promise<{ error?: string; success?: string }>;
}

export const KANBAN_COLUMNS: Array<{
  status: TicketStatus;
  title: string;
}> = [
  { status: "open", title: "Open" },
  { status: "in_progress", title: "In Progress" },
  { status: "resolved", title: "Resolved" },
  { status: "closed", title: "Closed" },
];

/**
 * Validates a drop event against the FSM lifecycle transitions.
 */
export function validateKanbanDrop(
  ticket: TicketLifecycleTarget,
  targetStatus: TicketStatus,
  actor: TicketActorContext,
): TransitionEvaluation {
  return canTransitionTicket(ticket, targetStatus, actor);
}

export function KanbanBoard(props: KanbanBoardProps) {
  const {
    tickets,
    orgSlug,
    callerUserId,
    callerRole,
    onStatusChange,
  } = props;
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleDrop = useCallback(
    async (ticketId: string, targetStatus: TicketStatus) => {
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket) {
        setErrorBanner("Cannot move ticket: Ticket could not be located.");
        return;
      }

      // No-op if dropped in the same column
      if (ticket.status === targetStatus) {
        return;
      }

      // Pre-drop validation: evaluate role-gated FSM rules
      const actor: TicketActorContext = {
        id: callerUserId,
        role: callerRole,
      };

      const evaluation = canTransitionTicket(ticket, targetStatus, actor);

      if (!evaluation.allowed) {
        setErrorBanner(
          `Cannot move ticket: ${evaluation.reason || "Illegal status transition."}`,
        );
        return;
      }

      // Transition allowed: clear any previous error and dispatch
      setErrorBanner(null);
      setIsUpdating(true);

      try {
        const result = await onStatusChange(ticketId, targetStatus);
        if (result?.error) {
          setErrorBanner(`Cannot move ticket: ${result.error}`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update ticket status.";
        setErrorBanner(`Cannot move ticket: ${message}`);
      } finally {
        setIsUpdating(false);
      }
    },
    [tickets, callerUserId, callerRole, onStatusChange],
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Error Alert Banner */}
      {errorBanner && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900 shadow-2xs dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200 animate-in fade-in duration-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span className="font-medium leading-relaxed">{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="rounded-md p-1 text-red-500 hover:bg-red-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/40 transition cursor-pointer"
            aria-label="Dismiss alert"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* 4-Column Responsive Drag-and-Drop Board */}
      <div
        className={`flex gap-4 overflow-x-auto pb-4 pt-1 items-start min-w-full ${
          isUpdating ? "pointer-events-none opacity-90" : ""
        }`}
      >
        {KANBAN_COLUMNS.map((column) => {
          const columnTickets = tickets.filter(
            (ticket) => ticket.status === column.status,
          );
          return (
            <KanbanColumn
              key={column.status}
              status={column.status}
              title={column.title}
              tickets={columnTickets}
              orgSlug={orgSlug}
              onDrop={handleDrop}
            />
          );
        })}
      </div>
    </div>
  );
}
