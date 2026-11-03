"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  aggregateWorkspacePresence,
  formatPresenceUser,
} from "@/lib/realtime/presence";
import type { PresenceUser, OrgRole } from "@/types/database";

export interface UseWorkspacePresenceParams {
  orgId: string;
  currentUser: {
    id: string;
    email: string;
    full_name: string | null;
    role: OrgRole;
  };
  currentView?: "list" | "kanban" | "ticket";
  viewingTicketId?: string | null;
}

export function useWorkspacePresence({
  orgId,
  currentUser,
  currentView,
  viewingTicketId,
}: UseWorkspacePresenceParams): {
  onlineUsers: PresenceUser[];
} {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!orgId || !currentUser?.id) {
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`org:${orgId}:presence`);

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      setOnlineUsers(
        aggregateWorkspacePresence(
          state as unknown as Record<string, PresenceUser[]>,
        ),
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        const presenceData = formatPresenceUser({
          userId: currentUser.id,
          email: currentUser.email,
          fullName: currentUser.full_name,
          role: currentUser.role,
          currentView,
          viewingTicketId,
        });
        channel.track(presenceData);
      }
    });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [
    orgId,
    currentUser.id,
    currentUser.email,
    currentUser.full_name,
    currentUser.role,
    currentView,
    viewingTicketId,
  ]);

  return { onlineUsers };
}
