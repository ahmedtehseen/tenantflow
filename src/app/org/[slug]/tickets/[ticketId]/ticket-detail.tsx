"use client";

import { useState, useEffect, useRef, useTransition, useActionState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Lock,
} from "lucide-react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Select } from "@/components/ui/select";
import {
  getAvailableNextStatuses,
  canEditTicket,
} from "@/lib/tickets/lifecycle";
import {
  updateTicketAction,
  deleteTicketAction,
  type TicketActionState,
} from "../actions";
import type { MemberOption } from "../_components/ticket-list";
import type { TicketStatus, TicketPriority, OrgRole } from "@/types/database";
import {
  ActivityTimeline,
  type ActivityItem,
} from "./_components/activity-timeline";
import { createClient } from "@/lib/supabase/client";
import { useWorkspacePresence } from "@/hooks/use-workspace-presence";
import { filterTicketViewers } from "@/lib/realtime/presence";
import { PresenceAvatars } from "../_components/presence-avatars";

interface TicketDetailProps {
  ticket: {
    id: string;
    organization_id: string;
    title: string;
    description: string | null;
    status: TicketStatus;
    priority: TicketPriority;
    created_by: string | null;
    assigned_to: string | null;
    created_at: string;
    updated_at: string;
  };
  creatorProfile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  assigneeProfile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  members: MemberOption[];
  activities: ActivityItem[];
  orgId: string;
  orgSlug: string;
  callerUserId: string;
  callerRole: OrgRole;
  callerEmail?: string;
  callerName?: string | null;
}

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const initialActionState: TicketActionState = {};

export function TicketDetail({
  ticket,
  creatorProfile,
  assigneeProfile,
  members,
  activities = [],
  orgId,
  orgSlug,
  callerUserId,
  callerRole,
  callerEmail = "",
  callerName = null,
}: TicketDetailProps) {
  const [currentTicket, setCurrentTicket] = useState(ticket);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description || "");
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [assignedTo, setAssignedTo] = useState<string>(ticket.assigned_to || "");
  const [timelineActivities, setTimelineActivities] = useState<ActivityItem[]>(activities);

  // Live workspace presence: broadcast current viewing ticket and view mode
  const { onlineUsers } = useWorkspacePresence({
    orgId,
    currentUser: {
      id: callerUserId,
      email: callerEmail,
      full_name: callerName,
      role: callerRole,
    },
    currentView: "ticket",
    viewingTicketId: currentTicket.id,
  });

  const activeTicketViewers = filterTicketViewers(onlineUsers, currentTicket.id);
  // Exclude current caller from other viewers avatar stack / notice
  const otherViewers = activeTicketViewers.filter((u) => u.userId !== callerUserId);

  // Keep latest form state in a ref to avoid stale closures in realtime listener
  const formStateRef = useRef({
    title,
    description,
    status,
    priority,
    assignedTo,
    currentTicket,
  });
  useEffect(() => {
    formStateRef.current = {
      title,
      description,
      status,
      priority,
      assignedTo,
      currentTicket,
    };
  }, [title, description, status, priority, assignedTo, currentTicket]);

  const membersRef = useRef<MemberOption[]>(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  // Realtime subscription for ticket and ticket activities
  useEffect(() => {
    if (!ticket.id || !orgId) return;

    const supabase = createClient();
    const channel = supabase.channel(`org:${orgId}:ticket:${ticket.id}`);

    // Listen to updates on this ticket
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tickets",
        filter: `id=eq.${ticket.id}`,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        if (!payload?.new?.id) return;
        const incoming = payload.new as TicketDetailProps["ticket"];
        const latest = formStateRef.current;
        const prevTicket = latest.currentTicket;

        // Preserve pending edits if user has modified input fields locally
        if (latest.title === prevTicket.title) {
          setTitle(incoming.title);
        }
        if (latest.description === (prevTicket.description || "")) {
          setDescription(incoming.description || "");
        }
        if (latest.status === prevTicket.status) {
          setStatus(incoming.status);
        }
        if (latest.priority === prevTicket.priority) {
          setPriority(incoming.priority);
        }
        if (latest.assignedTo === (prevTicket.assigned_to || "")) {
          setAssignedTo(incoming.assigned_to || "");
        }

        setCurrentTicket(incoming);
      },
    );

    // Listen to new activity logs on this ticket
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ticket_activities",
        filter: `ticket_id=eq.${ticket.id}`,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        if (!payload?.new?.id) return;
        const raw = payload.new;
        const actorMember = raw.actor_id
          ? membersRef.current.find((m) => m.user_id === raw.actor_id)
          : null;

        const newActivity: ActivityItem = {
          id: raw.id,
          ticket_id: raw.ticket_id,
          organization_id: raw.organization_id,
          actor_id: raw.actor_id ?? null,
          activity_type: raw.activity_type,
          old_value: raw.old_value ?? null,
          new_value: raw.new_value ?? null,
          metadata: (raw.metadata || {}) as Record<string, unknown>,
          created_at: raw.created_at,
          actor: actorMember
            ? {
                id: actorMember.user_id,
                full_name: actorMember.full_name,
                email: actorMember.email,
              }
            : null,
        };

        setTimelineActivities((prev) => {
          if (prev.some((a) => a.id === newActivity.id)) {
            return prev;
          }
          return [newActivity, ...prev];
        });
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticket.id, orgId]);

  // Synchronize local form state when server-refreshed props arrive
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCurrentTicket(ticket);
    setTitle(ticket.title);
    setDescription(ticket.description || "");
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setAssignedTo(ticket.assigned_to || "");
  }, [ticket]);

  useEffect(() => {
    setTimelineActivities(activities);
  }, [activities]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const canEdit = canEditTicket(currentTicket, {
    id: callerUserId,
    role: callerRole,
  }).allowed;

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const availableNext = getAvailableNextStatuses(currentTicket, {
    id: callerUserId,
    role: callerRole,
  });

  const boundUpdateAction = updateTicketAction.bind(
    null,
    currentTicket.id,
    orgId,
    orgSlug,
  );
  const [state, formAction, isUpdatePending] = useActionState(
    boundUpdateAction,
    initialActionState,
  );

  const canDelete =
    currentTicket.created_by === callerUserId ||
    callerRole === "owner" ||
    callerRole === "admin";

  const handleDelete = () => {
    startDeleteTransition(async () => {
      await deleteTicketAction(currentTicket.id, orgId, orgSlug, true);
    });
  };

  const formattedCreated = new Date(currentTicket.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const formattedUpdated = new Date(currentTicket.updated_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const currentAssignee = currentTicket.assigned_to
    ? members.find((m) => m.user_id === currentTicket.assigned_to) ||
      (assigneeProfile?.id === currentTicket.assigned_to ? assigneeProfile : null)
    : null;

  return (
    <div className="space-y-6">
      {/* Top Bar with back link, live viewers & delete */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/org/${orgSlug}/tickets`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition"
          >
            <ArrowLeft className="size-3.5" />
            Back to Tickets
          </Link>

          {otherViewers.length > 0 && (
            <div
              className="flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 text-xs text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 shadow-2xs"
              role="status"
              aria-label="Other viewers on this ticket"
            >
              <PresenceAvatars users={otherViewers} />
              <span className="text-[11px] font-medium">
                {otherViewers.length === 1
                  ? `${otherViewers[0].fullName || otherViewers[0].email} is viewing this ticket`
                  : `${otherViewers.length} others viewing this ticket`}
              </span>
            </div>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-2xs hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/50 transition cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            Delete Ticket
          </button>
        )}
      </div>

      {state?.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {state?.success && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          <span>{state.success}</span>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          <Lock className="size-4 shrink-0" />
          <span>
            Read-Only: You cannot edit this ticket because you are not the author, assignee, or a workspace admin.
          </span>
        </div>
      )}

      {/* Main Form */}
      <form key={currentTicket.id} action={formAction}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main ticket body (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="title"
                    className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    Ticket Title
                  </label>
                  <div
                    className="flex items-center gap-2"
                    role="region"
                    aria-label="Active ticket viewers"
                  >
                    <PresenceAvatars users={otherViewers} />
                    {otherViewers.length > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300 shadow-2xs">
                        {otherViewers.length === 1
                          ? `${otherViewers[0].fullName || otherViewers[0].email} viewing now`
                          : `${otherViewers.length} viewing now`}
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                        Viewing now
                      </span>
                    )}
                  </div>
                </div>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  disabled={!canEdit || isUpdatePending}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 shadow-2xs outline-none transition focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="description"
                  className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={8}
                  disabled={!canEdit || isUpdatePending}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add details, reproduction steps, or context..."
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-zinc-900 shadow-2xs outline-none transition focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              {canEdit && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatePending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-indigo-500 disabled:opacity-50 transition cursor-pointer"
                  >
                    {isUpdatePending ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Saving changes...
                      </>
                    ) : (
                      <>
                        <Save className="size-3.5" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Activity & History Timeline Card */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Activity &amp; History
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Audit log of state transitions, reassignments, and updates.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {timelineActivities.length} {timelineActivities.length === 1 ? "event" : "events"}
                </span>
              </div>

              <ActivityTimeline activities={timelineActivities} members={members} />
            </div>
          </div>

          {/* Properties Sidebar (Right 1 col) */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Ticket Properties
              </h3>

              {/* Status */}
              <div className="space-y-1.5">
                <label
                  htmlFor="status"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Status
                </label>
                <Select
                  id="status"
                  name="status"
                  value={status}
                  disabled={!canEdit || isUpdatePending}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  containerClassName="w-full"
                  className="w-full py-2"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.value !== currentTicket.status && !availableNext.includes(opt.value)}
                    >
                      {opt.label}
                    </option>
                  ))}
                </Select>
                {currentTicket.status === "closed" && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Reopening closed tickets requires Workspace Admin or Owner authority.
                  </p>
                )}
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label
                  htmlFor="priority"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Priority
                </label>
                <Select
                  id="priority"
                  name="priority"
                  value={priority}
                  disabled={!canEdit || isUpdatePending}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  containerClassName="w-full"
                  className="w-full py-2"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </div>

              {/* Assignee */}
              <div className="space-y-1.5">
                <label
                  htmlFor="assigned_to"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Assignee
                </label>
                <Select
                  id="assigned_to"
                  name="assigned_to"
                  value={assignedTo}
                  disabled={!canEdit || isUpdatePending}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  containerClassName="w-full"
                  className="w-full py-2"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3 text-xs text-zinc-500 dark:text-zinc-400">
                <div>
                  <span className="block text-[11px] font-medium text-zinc-400">
                    Created By
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {creatorProfile?.full_name || creatorProfile?.email || "Unknown"}
                  </span>
                  <span
                    className="block text-[10px] text-zinc-400 font-mono"
                    suppressHydrationWarning
                  >
                    {formattedCreated}
                  </span>
                </div>

                {currentAssignee ? (
                  <div>
                    <span className="block text-[11px] font-medium text-zinc-400">
                      Assigned To
                    </span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {currentAssignee.full_name || currentAssignee.email}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="block text-[11px] font-medium text-zinc-400">
                      Assigned To
                    </span>
                    <span className="text-zinc-400 italic">
                      Unassigned
                    </span>
                  </div>
                )}

                <div>
                  <span className="block text-[11px] font-medium text-zinc-400">
                    Last Updated
                  </span>
                  <span
                    className="font-mono text-[11px]"
                    suppressHydrationWarning
                  >
                    {formattedUpdated}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-zinc-400">
                    Ticket ID
                  </span>
                  <span className="font-mono text-[10px] select-all">
                    {currentTicket.id}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50/60 p-3 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-start gap-2">
                <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                <span>
                  Protected by PostgreSQL RLS. Assignee constraints enforced on this tenant.
                </span>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        isLoading={isDeleting}
        title="Delete this ticket?"
        description={`Are you sure you want to delete "${currentTicket.title}"? This action cannot be undone.`}
        confirmText="Delete Ticket"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
