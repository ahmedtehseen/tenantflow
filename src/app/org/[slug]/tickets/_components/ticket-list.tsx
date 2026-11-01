"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Ticket as TicketIcon,
  Trash2,
  Calendar,
  X,
  ExternalLink,
} from "lucide-react";
import { TicketStatusBadge } from "./ticket-status-badge";
import { TicketPriorityBadge } from "./ticket-priority-badge";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Select } from "@/components/ui/select";
import { deleteTicketAction } from "../actions";
import type { TicketStatus, TicketPriority, OrgRole } from "@/types/database";

export interface TicketItem {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  creator?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  assignee?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export interface MemberOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface TicketListProps {
  tickets: TicketItem[];
  members: MemberOption[];
  orgId: string;
  orgSlug: string;
  callerUserId: string;
  callerRole: OrgRole;
}

export function TicketList({
  tickets,
  members,
  orgId,
  orgSlug,
  callerUserId,
  callerRole,
}: TicketListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  const [ticketToDelete, setTicketToDelete] = useState<TicketItem | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  // Metrics
  const metrics = useMemo(() => {
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "open").length,
      inProgress: tickets.filter((t) => t.status === "in_progress").length,
      resolvedClosed: tickets.filter(
        (t) => t.status === "resolved" || t.status === "closed",
      ).length,
    };
  }, [tickets]);

  // Filtering
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      // Search text match
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = ticket.title.toLowerCase().includes(query);
        const matchesDesc =
          ticket.description?.toLowerCase().includes(query) ?? false;
        if (!matchesTitle && !matchesDesc) return false;
      }

      // Status match
      if (statusFilter !== "all" && ticket.status !== statusFilter) {
        return false;
      }

      // Priority match
      if (priorityFilter !== "all" && ticket.priority !== priorityFilter) {
        return false;
      }

      // Assignee match
      if (assigneeFilter !== "all") {
        if (assigneeFilter === "unassigned" && ticket.assigned_to !== null) {
          return false;
        }
        if (assigneeFilter === "me" && ticket.assigned_to !== callerUserId) {
          return false;
        }
        if (
          assigneeFilter !== "unassigned" &&
          assigneeFilter !== "me" &&
          ticket.assigned_to !== assigneeFilter
        ) {
          return false;
        }
      }

      return true;
    });
  }, [tickets, search, statusFilter, priorityFilter, assigneeFilter, callerUserId]);

  const handleDeleteConfirm = () => {
    if (!ticketToDelete) return;
    startDeleteTransition(async () => {
      await deleteTicketAction(ticketToDelete.id, orgId, orgSlug);
      setTicketToDelete(null);
    });
  };

  const canDeleteTicket = (ticket: TicketItem) => {
    return (
      ticket.created_by === callerUserId ||
      callerRole === "owner" ||
      callerRole === "admin"
    );
  };

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`flex flex-col rounded-xl border p-3.5 text-left transition cursor-pointer ${
            statusFilter === "all"
              ? "border-indigo-600 bg-indigo-50/40 dark:border-indigo-500 dark:bg-indigo-950/30"
              : "border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Total Tickets
          </span>
          <span className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {metrics.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("open")}
          className={`flex flex-col rounded-xl border p-3.5 text-left transition cursor-pointer ${
            statusFilter === "open"
              ? "border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30"
              : "border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
            Open
          </span>
          <span className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {metrics.open}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("in_progress")}
          className={`flex flex-col rounded-xl border p-3.5 text-left transition cursor-pointer ${
            statusFilter === "in_progress"
              ? "border-amber-600 bg-amber-50/40 dark:border-amber-500 dark:bg-amber-950/30"
              : "border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
            In Progress
          </span>
          <span className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {metrics.inProgress}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("resolved")}
          className={`flex flex-col rounded-xl border p-3.5 text-left transition cursor-pointer ${
            statusFilter === "resolved"
              ? "border-emerald-600 bg-emerald-50/40 dark:border-emerald-500 dark:bg-emerald-950/30"
              : "border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Resolved / Closed
          </span>
          <span className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {metrics.resolvedClosed}
          </span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets by title or description..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 py-2 pl-9 pr-8 text-xs text-zinc-900 outline-none transition focus:border-indigo-600 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:focus:bg-zinc-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </Select>

          {/* Priority Filter */}
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="py-2 text-xs"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>

          {/* Assignee Filter */}
          <Select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="py-2 text-xs"
          >
            <option value="all">All Assignees</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </Select>

          {/* Create Button */}
          <Link
            href={`/org/${orgSlug}/tickets/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 transition"
          >
            <Plus className="size-3.5" />
            <span>New Ticket</span>
          </Link>
        </div>
      </div>

      {/* Ticket Rows */}
      {filteredTickets.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {filteredTickets.map((ticket) => {
            const authorName =
              ticket.creator?.full_name || ticket.creator?.email || "Unknown";
            const assigneeName =
              ticket.assignee?.full_name || ticket.assignee?.email || null;

            const formattedDate = new Date(ticket.created_at).toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
              },
            );

            return (
              <div
                key={ticket.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition gap-4"
              >
                {/* Left: Priority, Status, Title, Meta */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="flex flex-col gap-1.5 pt-0.5 shrink-0">
                    <TicketPriorityBadge priority={ticket.priority} />
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/org/${orgSlug}/tickets/${ticket.id}`}
                        className="text-sm font-semibold text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400 transition truncate"
                      >
                        {ticket.title}
                      </Link>
                      <TicketStatusBadge
                        status={ticket.status}
                        ticketId={ticket.id}
                        orgId={orgId}
                        orgSlug={orgSlug}
                        isEditable={true}
                      />
                    </div>

                    {ticket.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        {ticket.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                      <span className="font-mono">
                        #{ticket.id.slice(0, 8)}
                      </span>
                      <span>&middot;</span>
                      <span>Created by {authorName}</span>
                      <span>&middot;</span>
                      <span className="flex items-center gap-1" suppressHydrationWarning>
                        <Calendar className="size-3" />
                        {formattedDate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Assignee & Action Buttons */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  {/* Assignee Badge */}
                  <div className="flex items-center gap-1.5 text-xs">
                    {assigneeName ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <div className="flex size-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
                          {assigneeName[0].toUpperCase()}
                        </div>
                        <span className="truncate max-w-[120px]">
                          {assigneeName}
                        </span>
                      </div>
                    ) : (
                      <span className="rounded-full border border-dashed border-zinc-200 px-2.5 py-0.5 text-[11px] text-zinc-400 dark:border-zinc-700">
                        Unassigned
                      </span>
                    )}
                  </div>

                  {/* View Details Link */}
                  <Link
                    href={`/org/${orgSlug}/tickets/${ticket.id}`}
                    title="View ticket details"
                    className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>

                  {/* Delete Button with UI Confirmation Modal */}
                  {canDeleteTicket(ticket) && (
                    <button
                      type="button"
                      onClick={() => setTicketToDelete(ticket)}
                      title="Delete ticket"
                      className="flex size-8 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 hover:bg-red-50 dark:border-red-950/60 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/50 transition cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
            <TicketIcon className="size-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {tickets.length === 0
              ? "No tickets yet"
              : "No tickets match your filters"}
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            {tickets.length === 0
              ? "Create your first operational ticket in this workspace to track tasks, bugs, or requests."
              : "Try adjusting your search query, status, or priority filters to find what you are looking for."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {tickets.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setAssigneeFilter("all");
                }}
                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
              >
                Clear Filters
              </button>
            )}
            <Link
              href={`/org/${orgSlug}/tickets/new`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 transition"
            >
              <Plus className="size-3.5" />
              Create Ticket
            </Link>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={ticketToDelete !== null}
        isLoading={isDeleting}
        title="Delete ticket?"
        description={`Are you sure you want to delete "${ticketToDelete?.title}"? This operational record will be permanently removed.`}
        confirmText="Delete Ticket"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onClose={() => setTicketToDelete(null)}
      />
    </div>
  );
}
