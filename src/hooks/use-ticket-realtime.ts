"use client";

import { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyTicketRealtimeEvent,
  type TicketItem,
  type TicketMemberInfo,
} from "@/lib/realtime/ticket-events";

export interface UseTicketRealtimeParams {
  orgId: string;
  initialTickets: TicketItem[];
  memberMap: Map<string, TicketMemberInfo>;
}

export function useTicketRealtime({
  orgId,
  initialTickets,
  memberMap,
}: UseTicketRealtimeParams): {
  tickets: TicketItem[];
  setTickets: Dispatch<SetStateAction<TicketItem[]>>;
} {
  const [tickets, setTickets] = useState<TicketItem[]>(initialTickets);

  // Keep memberMap in a ref so the event listener always uses the freshest member profiles
  // without tearing down and recreating the realtime subscription.
  const memberMapRef = useRef<Map<string, TicketMemberInfo>>(memberMap);
  useEffect(() => {
    memberMapRef.current = memberMap;
  }, [memberMap]);

  useEffect(() => {
    if (!orgId) {
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`org:${orgId}:tickets`);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tickets",
        filter: `organization_id=eq.${orgId}`,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        setTickets((current) =>
          applyTicketRealtimeEvent(
            current,
            {
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            },
            memberMapRef.current,
          ),
        );
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  return { tickets, setTickets };
}
