import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error TS5097: Node ESM requires .ts extension under --experimental-strip-types
import { applyTicketRealtimeEvent, optimisticTicketStatusTransition, revertOptimisticTicketStatus, type TicketItem, type TicketMemberInfo } from "../../src/lib/realtime/ticket-events.ts";
import type { TicketStatus } from "../../src/types/database.ts";

describe("Pure Realtime Event Reducer & Optimistic State Transitions", () => {
  const memberAlice: TicketMemberInfo = {
    id: "user-alice",
    full_name: "Alice Engineer",
    email: "alice@example.com",
  };

  const memberBob: TicketMemberInfo = {
    id: "user-bob",
    full_name: "Bob Designer",
    email: "bob@example.com",
  };

  const memberMap = new Map<string, TicketMemberInfo>([
    [memberAlice.id, memberAlice],
    [memberBob.id, memberBob],
  ]);

  const initialTickets: TicketItem[] = [
    {
      id: "ticket-1",
      organization_id: "org-1",
      title: "Fix login button styling",
      description: "Button overflows on mobile viewports",
      status: "open",
      priority: "medium",
      created_by: memberAlice.id,
      assigned_to: memberBob.id,
      created_at: "2026-11-04T01:00:00.000Z",
      creator: memberAlice,
      assignee: memberBob,
    },
    {
      id: "ticket-2",
      organization_id: "org-1",
      title: "Database index for slug lookups",
      description: null,
      status: "in_progress",
      priority: "high",
      created_by: memberBob.id,
      assigned_to: memberAlice.id,
      created_at: "2026-11-04T01:30:00.000Z",
      creator: memberBob,
      assignee: memberAlice,
    },
  ];

  describe("applyTicketRealtimeEvent", () => {
    describe("INSERT event", () => {
      it("prepends new ticket and resolves creator and assignee from memberMap", () => {
        const event = {
          eventType: "INSERT" as const,
          new: {
            id: "ticket-3",
            organization_id: "org-1",
            title: "Add real-time presence avatars",
            description: "Show who is currently viewing the ticket",
            status: "open" as TicketStatus,
            priority: "urgent" as const,
            created_by: memberAlice.id,
            assigned_to: memberBob.id,
            created_at: "2026-11-04T02:00:00.000Z",
          },
          old: {},
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 3);
        assert.equal(result[0].id, "ticket-3");
        assert.equal(result[0].title, "Add real-time presence avatars");
        assert.deepEqual(result[0].creator, memberAlice);
        assert.deepEqual(result[0].assignee, memberBob);
        assert.equal(result[1].id, "ticket-1");
        assert.equal(result[2].id, "ticket-2");
        // Immutability check
        assert.equal(initialTickets.length, 2);
      });

      it("handles unassigned tickets by setting assignee to null", () => {
        const event = {
          eventType: "INSERT" as const,
          new: {
            id: "ticket-4",
            organization_id: "org-1",
            title: "Unassigned task",
            description: null,
            status: "open" as TicketStatus,
            priority: "low" as const,
            created_by: memberAlice.id,
            assigned_to: null,
            created_at: "2026-11-04T02:05:00.000Z",
          },
          old: {},
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result[0].id, "ticket-4");
        assert.equal(result[0].assignee, null);
        assert.deepEqual(result[0].creator, memberAlice);
      });

      it("sets creator or assignee to null if not found in memberMap", () => {
        const event = {
          eventType: "INSERT" as const,
          new: {
            id: "ticket-5",
            organization_id: "org-1",
            title: "External actor ticket",
            description: null,
            status: "open" as TicketStatus,
            priority: "medium" as const,
            created_by: "unknown-user",
            assigned_to: "another-unknown-user",
            created_at: "2026-11-04T02:10:00.000Z",
          },
          old: {},
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result[0].id, "ticket-5");
        assert.equal(result[0].creator, null);
        assert.equal(result[0].assignee, null);
      });

      it("deduplicates when ticket with same id already exists in array", () => {
        const event = {
          eventType: "INSERT" as const,
          new: {
            id: "ticket-1",
            organization_id: "org-1",
            title: "Updated via re-insert",
            description: "Updated description",
            status: "in_progress" as TicketStatus,
            priority: "high" as const,
            created_by: memberAlice.id,
            assigned_to: memberAlice.id,
            created_at: "2026-11-04T01:00:00.000Z",
          },
          old: {},
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 2);
        assert.equal(result[0].id, "ticket-1");
        assert.equal(result[0].title, "Updated via re-insert");
        assert.deepEqual(result[0].assignee, memberAlice);
      });
    });

    describe("UPDATE event", () => {
      it("modifies matching ticket in place while preserving order", () => {
        const event = {
          eventType: "UPDATE" as const,
          new: {
            id: "ticket-1",
            organization_id: "org-1",
            title: "Fix login button styling (UPDATED)",
            description: "Updated notes",
            status: "in_progress" as TicketStatus,
            priority: "urgent" as const,
            created_by: memberAlice.id,
            assigned_to: memberBob.id,
            created_at: "2026-11-04T01:00:00.000Z",
          },
          old: { id: "ticket-1" },
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 2);
        assert.equal(result[0].id, "ticket-1");
        assert.equal(result[0].title, "Fix login button styling (UPDATED)");
        assert.equal(result[0].status, "in_progress");
        assert.equal(result[0].priority, "urgent");
        assert.equal(result[1].id, "ticket-2");
        assert.equal(initialTickets[0].status, "open", "initialTickets must not be mutated");
      });

      it("re-resolves assignee when assigned_to changes to a different member", () => {
        const event = {
          eventType: "UPDATE" as const,
          new: {
            id: "ticket-1",
            assigned_to: memberAlice.id,
          },
          old: { id: "ticket-1", assigned_to: memberBob.id },
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result[0].assigned_to, memberAlice.id);
        assert.deepEqual(result[0].assignee, memberAlice);
        assert.deepEqual(result[0].creator, memberAlice);
      });

      it("sets assignee to null when ticket is unassigned", () => {
        const event = {
          eventType: "UPDATE" as const,
          new: {
            id: "ticket-1",
            assigned_to: null,
          },
          old: { id: "ticket-1", assigned_to: memberBob.id },
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result[0].assigned_to, null);
        assert.equal(result[0].assignee, null);
      });

      it("returns unmodified array if updated ticket id is not in current list", () => {
        const event = {
          eventType: "UPDATE" as const,
          new: {
            id: "non-existent-ticket",
            title: "Ghost ticket",
          },
          old: { id: "non-existent-ticket" },
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 2);
        assert.deepEqual(result, initialTickets);
      });
    });

    describe("DELETE event", () => {
      it("removes matching ticket by old.id", () => {
        const event = {
          eventType: "DELETE" as const,
          new: {},
          old: { id: "ticket-1" },
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 1);
        assert.equal(result[0].id, "ticket-2");
        assert.equal(initialTickets.length, 2, "original array must not be mutated");
      });

      it("removes matching ticket by new.id if old.id is absent", () => {
        const event = {
          eventType: "DELETE" as const,
          new: { id: "ticket-2" },
          old: {},
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 1);
        assert.equal(result[0].id, "ticket-1");
      });

      it("returns all tickets if deleted id does not match any ticket", () => {
        const event = {
          eventType: "DELETE" as const,
          new: {},
          old: { id: "ticket-999" },
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 2);
        assert.deepEqual(result, initialTickets);
      });
    });

    describe("unknown eventType", () => {
      it("returns copy of current tickets without modification", () => {
        const event = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eventType: "UNKNOWN" as any,
          new: {},
          old: {},
        };

        const result = applyTicketRealtimeEvent(initialTickets, event, memberMap);

        assert.equal(result.length, 2);
        assert.deepEqual(result, initialTickets);
      });
    });
  });

  describe("optimisticTicketStatusTransition", () => {
    it("updates ticket status immediately in the array", () => {
      const result = optimisticTicketStatusTransition(initialTickets, "ticket-1", "resolved");

      assert.equal(result.length, 2);
      assert.equal(result[0].id, "ticket-1");
      assert.equal(result[0].status, "resolved");
      assert.equal(result[1].status, "in_progress");
      assert.equal(initialTickets[0].status, "open", "must not mutate original array");
    });

    it("leaves all other ticket fields unchanged", () => {
      const result = optimisticTicketStatusTransition(initialTickets, "ticket-1", "in_progress");

      assert.equal(result[0].title, initialTickets[0].title);
      assert.equal(result[0].priority, initialTickets[0].priority);
      assert.deepEqual(result[0].creator, initialTickets[0].creator);
      assert.deepEqual(result[0].assignee, initialTickets[0].assignee);
    });

    it("returns unchanged array if ticketId does not exist", () => {
      const result = optimisticTicketStatusTransition(initialTickets, "ticket-999", "closed");

      assert.equal(result.length, 2);
      assert.deepEqual(result, initialTickets);
    });
  });

  it("ignores delayed realtime updates older than the authoritative snapshot", () => {
    const current = initialTickets.map((ticket) => ({ ...ticket, updated_at: "2026-11-13T10:00:00Z" }));
    for (const eventType of ["INSERT", "UPDATE"]) {
      const result = applyTicketRealtimeEvent(current, {
        eventType,
        new: { ...current[0], title: "Outdated", updated_at: "2026-11-13T09:00:00+00:00" },
      }, memberMap);
      assert.equal(result[0].title, current[0].title);
      assert.equal(result[0].updated_at, current[0].updated_at);
    }
  });

  describe("revertOptimisticTicketStatus", () => {
    it("reverts ticket status back to previousStatus", () => {
      // Simulate optimistic state first
      const optimisticTickets = optimisticTicketStatusTransition(
        initialTickets,
        "ticket-1",
        "resolved"
      );
      assert.equal(optimisticTickets[0].status, "resolved");

      // Now revert
      const reverted = revertOptimisticTicketStatus(optimisticTickets, "ticket-1", "open");

      assert.equal(reverted.length, 2);
      assert.equal(reverted[0].id, "ticket-1");
      assert.equal(reverted[0].status, "open");
      assert.equal(optimisticTickets[0].status, "resolved", "must not mutate optimistic array");
    });

    it("preserves a newer server status when rolling back an optimistic transition", () => {
      const concurrent = optimisticTicketStatusTransition(initialTickets, "ticket-1", "resolved");
      const result = revertOptimisticTicketStatus(concurrent, "ticket-1", "open", "in_progress");
      assert.equal(result[0].status, "resolved");
      const pending = optimisticTicketStatusTransition(initialTickets, "ticket-1", "in_progress");
      assert.equal(revertOptimisticTicketStatus(pending, "ticket-1", "open", "in_progress")[0].status, "open");
    });

    it("returns unchanged array if ticketId does not exist", () => {
      const result = revertOptimisticTicketStatus(initialTickets, "ticket-999", "open");

      assert.equal(result.length, 2);
      assert.deepEqual(result, initialTickets);
    });
  });
});
