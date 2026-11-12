"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotificationsRealtime } from "@/hooks/use-notifications-realtime";
import { markNotificationReadAction } from "../notifications/actions";

export function NotificationBell({
  orgId,
  slug,
  userId,
}: {
  orgId: string;
  slug: string;
  userId: string;
}) {
  const { items, unread, error, refresh } = useNotificationsRealtime(
    orgId,
    userId,
  );
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  function markRead(id: string | null, ticketId?: string | null) {
    startTransition(async () => {
      try {
        const result = await markNotificationReadAction(slug, orgId, id);
        if (result.error) {
          setActionError(result.error);
          return;
        }
        setActionError("");
        await refresh();
        if (ticketId) {
          panel.current?.removeAttribute("open");
          router.push(`/org/${slug}/tickets/${ticketId}`);
        }
      } catch {
        setActionError("Unable to update notifications. Try again.");
      }
    });
  }
  return (
    <details
      ref={panel}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          panel.current?.removeAttribute("open");
          panel.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={`Notifications, ${unread} unread`}
        className="relative flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </summary>
      <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <button
            type="button"
            disabled={pending || !unread}
            onClick={() => markRead(null)}
            className="text-xs text-indigo-600 disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
        {(error || actionError) && (
          <p role="alert" className="text-xs text-red-600">
            {actionError || error}
          </p>
        )}
        {!items.length && !error && (
          <p className="py-5 text-center text-xs text-zinc-500">
            No notifications yet.
          </p>
        )}
        <ul className="max-h-96 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => markRead(item.id, item.ticket_id)}
                className={`w-full rounded-lg p-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${!item.read_at ? "bg-indigo-50 dark:bg-indigo-950/30" : ""}`}
              >
                <span className="block text-xs font-semibold">
                  {!item.read_at && <span className="sr-only">Unread. </span>}
                  {item.title}
                </span>
                <span className="mt-1 block break-words text-xs text-zinc-500">
                  {item.body}
                </span>
                <time
                  className="mt-1 block text-[10px] text-zinc-400"
                  dateTime={item.created_at}
                >
                  {new Date(item.created_at).toLocaleString()}
                </time>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
