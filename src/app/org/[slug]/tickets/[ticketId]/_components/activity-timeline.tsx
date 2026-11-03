"use client";

import {
  Sparkles,
  GitCommit,
  AlertTriangle,
  UserCheck,
  FileText,
} from "lucide-react";
import { TicketStatusBadge } from "../../_components/ticket-status-badge";
import { TicketPriorityBadge } from "../../_components/ticket-priority-badge";
import type { TicketStatus, TicketPriority } from "@/types/database";
import type { MemberOption } from "../../_components/ticket-list";

export interface ActivityItem {
  id: string;
  ticket_id: string;
  organization_id: string;
  actor_id: string | null;
  activity_type:
    | "created"
    | "status_changed"
    | "priority_changed"
    | "assignee_changed"
    | "details_updated";
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface ActivityTimelineProps {
  activities: ActivityItem[];
  members?: MemberOption[];
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSeconds < 60) return "just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateStr;
  }
}

function getActorName(item: ActivityItem): string {
  if (item.actor?.full_name) return item.actor.full_name;
  if (item.actor?.email) return item.actor.email;
  if (item.actor_id) return "Team Member";
  return "System";
}

function getActivityConfig(type: ActivityItem["activity_type"]) {
  switch (type) {
    case "created":
      return {
        icon: Sparkles,
        badgeStyles:
          "bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-900/60 dark:text-indigo-400",
      };
    case "status_changed":
      return {
        icon: GitCommit,
        badgeStyles:
          "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/60 dark:border-blue-900/60 dark:text-blue-400",
      };
    case "priority_changed":
      return {
        icon: AlertTriangle,
        badgeStyles:
          "bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/60 dark:border-amber-900/60 dark:text-amber-400",
      };
    case "assignee_changed":
      return {
        icon: UserCheck,
        badgeStyles:
          "bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-950/60 dark:border-purple-900/60 dark:text-purple-400",
      };
    case "details_updated":
    default:
      return {
        icon: FileText,
        badgeStyles:
          "bg-zinc-100 border-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400",
      };
  }
}

export function ActivityTimeline({
  activities,
  members = [],
}: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="py-8 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800/80">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No activity recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activities.map((item, index) => {
        const isLast = index === activities.length - 1;
        const config = getActivityConfig(item.activity_type);
        const Icon = config.icon;
        const actorName = getActorName(item);

        return (
          <div key={item.id} className="relative flex items-start gap-3.5 group">
            {/* Vertical timeline connector */}
            {!isLast && (
              <span
                className="absolute left-4 top-8 -bottom-6 w-px bg-zinc-200 dark:bg-zinc-800"
                aria-hidden="true"
              />
            )}

            {/* Icon Node */}
            <div
              className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border shadow-2xs ${config.badgeStyles}`}
            >
              <Icon className="size-4" />
            </div>

            {/* Content & Timestamp */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 text-xs">
                <div className="text-zinc-700 dark:text-zinc-300 flex flex-wrap items-center gap-1.5 leading-relaxed">
                  {renderActivityDescription(item, actorName, members)}
                </div>
                <time
                  dateTime={item.created_at}
                  title={new Date(item.created_at).toLocaleString()}
                  suppressHydrationWarning
                  className="shrink-0 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 pt-0.5 sm:pt-0"
                >
                  {formatRelativeTime(item.created_at)}
                </time>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderActivityDescription(
  item: ActivityItem,
  actorName: string,
  members: MemberOption[],
) {
  switch (item.activity_type) {
    case "created":
      return (
        <span>
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {actorName}
          </strong>{" "}
          created this ticket
        </span>
      );

    case "status_changed":
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {actorName}
          </strong>{" "}
          changed status from{" "}
          {item.old_value ? (
            <TicketStatusBadge status={item.old_value as TicketStatus} />
          ) : (
            <span className="font-mono text-zinc-500">none</span>
          )}{" "}
          to{" "}
          {item.new_value ? (
            <TicketStatusBadge status={item.new_value as TicketStatus} />
          ) : (
            <span className="font-mono text-zinc-500">none</span>
          )}
        </span>
      );

    case "priority_changed":
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {actorName}
          </strong>{" "}
          changed priority from{" "}
          {item.old_value ? (
            <TicketPriorityBadge priority={item.old_value as TicketPriority} />
          ) : (
            <span className="font-mono text-zinc-500">none</span>
          )}{" "}
          to{" "}
          {item.new_value ? (
            <TicketPriorityBadge priority={item.new_value as TicketPriority} />
          ) : (
            <span className="font-mono text-zinc-500">none</span>
          )}
        </span>
      );

    case "assignee_changed": {
      if (!item.new_value) {
        return (
          <span>
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              {actorName}
            </strong>{" "}
            unassigned this ticket
          </span>
        );
      }
      const member = members.find((m) => m.user_id === item.new_value);
      const assigneeName = member?.full_name || member?.email || item.new_value;
      return (
        <span>
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {actorName}
          </strong>{" "}
          assigned ticket to{" "}
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {assigneeName}
          </strong>
        </span>
      );
    }

    case "details_updated":
      return (
        <span>
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {actorName}
          </strong>{" "}
          updated ticket title or description
        </span>
      );

    default:
      return (
        <span>
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {actorName}
          </strong>{" "}
          updated this ticket
        </span>
      );
  }
}
