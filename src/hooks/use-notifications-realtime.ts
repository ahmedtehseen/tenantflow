"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getNotificationInbox } from "@/lib/notifications/notification-service";
import type { Notification } from "@/types/database";

export function useNotificationsRealtime(orgId: string, userId: string) {
  const [inbox, setInbox] = useState<{ items: Notification[]; unread: number }>(
    { items: [], unread: 0 },
  );
  const [error, setError] = useState("");
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    const client = createClient();
    let disposed = false;
    let request = 0;
    async function load() {
      const current = ++request;
      try {
        const result = await getNotificationInbox(client, orgId, userId);
        if (!disposed && current === request) {
          setInbox(result);
          setError("");
        }
      } catch {
        if (!disposed && current === request)
          setError("Unable to load notifications.");
      }
    }
    refreshRef.current = load;
    const channel = client.channel(`notifications:user:${userId}:${orgId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      load,
    );
    async function subscribe() {
      await client.realtime.setAuth();
      if (disposed) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });
    }
    void subscribe().catch(() => {
      if (!disposed)
        setError("Live notifications unavailable. Refresh to try again.");
    });
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      disposed = true;
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [orgId, userId]);
  return { ...inbox, error, refresh };
}
