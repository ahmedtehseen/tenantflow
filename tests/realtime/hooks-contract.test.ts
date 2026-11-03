import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { useTicketRealtime } from "@/hooks/use-ticket-realtime";
import type { useWorkspacePresence } from "@/hooks/use-workspace-presence";
import type { TicketItem, TicketMemberInfo } from "@/lib/realtime/ticket-events";
import type { PresenceUser, OrgRole } from "@/types/database";

describe("Realtime Hooks Exports Contract", () => {
  it("verifies static TypeScript contracts and type assignability", () => {
    // Static compile-time type checks:
    // If the hook signatures deviate from the architectural contract,
    // TypeScript (tsc) will fail compilation.
    type UseTicketRealtimeFn = typeof useTicketRealtime;
    type ExpectedTicketParams = {
      orgId: string;
      initialTickets: TicketItem[];
      memberMap: Map<string, TicketMemberInfo>;
    };
    type ExpectedTicketReturn = {
      tickets: TicketItem[];
      setTickets: React.Dispatch<React.SetStateAction<TicketItem[]>>;
    };

    type UseWorkspacePresenceFn = typeof useWorkspacePresence;
    type ExpectedPresenceParams = {
      orgId: string;
      currentUser: {
        id: string;
        email: string;
        full_name: string | null;
        role: OrgRole;
      };
      currentView?: "list" | "kanban" | "ticket";
      viewingTicketId?: string | null;
    };
    type ExpectedPresenceReturn = {
      onlineUsers: PresenceUser[];
    };

    // Assignability verification
    const _ticketFn: (params: ExpectedTicketParams) => ExpectedTicketReturn =
      null as unknown as UseTicketRealtimeFn;
    const _presenceFn: (params: ExpectedPresenceParams) => ExpectedPresenceReturn =
      null as unknown as UseWorkspacePresenceFn;

    assert.ok(typeof _ticketFn !== "undefined");
    assert.ok(typeof _presenceFn !== "undefined");
  });

  it("verifies useTicketRealtime contract and channel configuration", () => {
    const ticketHookPath = path.resolve(process.cwd(), "src/hooks/use-ticket-realtime.ts");
    assert.ok(fs.existsSync(ticketHookPath), "use-ticket-realtime.ts must exist");

    const content = fs.readFileSync(ticketHookPath, "utf-8");
    assert.ok(content.includes('"use client"'), "Must be client hook");
    assert.ok(content.includes("export function useTicketRealtime"), "Must export useTicketRealtime");
    assert.ok(content.includes("applyTicketRealtimeEvent"), "Must delegate to applyTicketRealtimeEvent");
    assert.ok(content.includes("postgres_changes"), "Must subscribe to postgres_changes");
    assert.ok(content.includes("org:${orgId}:tickets"), "Must construct org-scoped tickets channel");
    assert.ok(content.includes("organization_id=eq.${orgId}"), "Must filter by organization_id");
    assert.ok(content.includes('table: "tickets"'), "Must listen to tickets table");
    assert.ok(content.includes("supabase.removeChannel(channel)"), "Must cleanup channel subscription");
  });

  it("verifies useWorkspacePresence contract and channel configuration", () => {
    const presenceHookPath = path.resolve(process.cwd(), "src/hooks/use-workspace-presence.ts");
    assert.ok(fs.existsSync(presenceHookPath), "use-workspace-presence.ts must exist");

    const content = fs.readFileSync(presenceHookPath, "utf-8");
    assert.ok(content.includes('"use client"'), "Must be client hook");
    assert.ok(content.includes("export function useWorkspacePresence"), "Must export useWorkspacePresence");
    assert.ok(content.includes("org:${orgId}:presence"), "Must construct org-scoped presence channel");
    assert.ok(content.includes("formatPresenceUser"), "Must format user presence payload");
    assert.ok(content.includes("aggregateWorkspacePresence"), "Must aggregate presence state");
    assert.ok(content.includes("channel.track(presenceData)"), "Must track presence data on SUBSCRIBED");
    assert.ok(content.includes("channel.untrack()"), "Must untrack on unmount");
    assert.ok(content.includes("supabase.removeChannel(channel)"), "Must cleanup channel on unmount");
  });
});
