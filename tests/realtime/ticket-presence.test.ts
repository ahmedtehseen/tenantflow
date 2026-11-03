import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error TS5097: Node ESM requires .ts extension under --experimental-strip-types
import { filterTicketViewers } from "../../src/lib/realtime/presence.ts";
import type { PresenceUser, TicketStatus, TicketPriority } from "../../src/types/database.ts";
import type { ActivityItem } from "../../src/app/org/[slug]/tickets/[ticketId]/_components/activity-timeline.tsx";

describe("Ticket Detail Presence Filtering", () => {
  it("isolates viewers currently on the specific ticket", () => {
    const users: PresenceUser[] = [
      {
        userId: "u1",
        email: "a@a.com",
        fullName: "Alice",
        role: "member",
        currentView: "ticket",
        viewingTicketId: "t-123",
        onlineAt: "",
      },
      {
        userId: "u2",
        email: "b@b.com",
        fullName: "Bob",
        role: "admin",
        currentView: "kanban",
        viewingTicketId: null,
        onlineAt: "",
      },
      {
        userId: "u3",
        email: "c@c.com",
        fullName: "Charlie",
        role: "member",
        currentView: "ticket",
        viewingTicketId: "t-456",
        onlineAt: "",
      },
    ];
    const viewers = filterTicketViewers(users, "t-123");
    assert.equal(viewers.length, 1);
    assert.equal(viewers[0].userId, "u1");
  });

  it("excludes the current caller from other viewers stack", () => {
    const callerUserId = "u1";
    const users: PresenceUser[] = [
      {
        userId: "u1",
        email: "a@a.com",
        fullName: "Alice",
        role: "member",
        currentView: "ticket",
        viewingTicketId: "t-123",
        onlineAt: "",
      },
      {
        userId: "u2",
        email: "b@b.com",
        fullName: "Bob",
        role: "admin",
        currentView: "ticket",
        viewingTicketId: "t-123",
        onlineAt: "",
      },
    ];

    const allTicketViewers = filterTicketViewers(users, "t-123");
    assert.equal(allTicketViewers.length, 2);

    const otherViewers = allTicketViewers.filter((u) => u.userId !== callerUserId);
    assert.equal(otherViewers.length, 1);
    assert.equal(otherViewers[0].userId, "u2");
    assert.equal(otherViewers[0].fullName, "Bob");
  });

  it("handles empty lists or no viewers on ticket", () => {
    assert.deepEqual(filterTicketViewers([], "t-123"), []);
    const users: PresenceUser[] = [
      {
        userId: "u1",
        email: "a@a.com",
        fullName: "Alice",
        role: "member",
        currentView: "kanban",
        viewingTicketId: null,
        onlineAt: "",
      },
    ];
    assert.deepEqual(filterTicketViewers(users, "t-123"), []);
  });

  it("supports multiple simultaneous teammates viewing the same ticket", () => {
    const users: PresenceUser[] = [
      {
        userId: "u1",
        email: "a@a.com",
        fullName: "Alice",
        role: "member",
        currentView: "ticket",
        viewingTicketId: "t-999",
        onlineAt: "",
      },
      {
        userId: "u2",
        email: "b@b.com",
        fullName: "Bob",
        role: "admin",
        currentView: "ticket",
        viewingTicketId: "t-999",
        onlineAt: "",
      },
      {
        userId: "u3",
        email: "c@c.com",
        fullName: "Charlie",
        role: "owner",
        currentView: "ticket",
        viewingTicketId: "t-999",
        onlineAt: "",
      },
    ];

    const viewers = filterTicketViewers(users, "t-999");
    assert.equal(viewers.length, 3);
    const callerId = "u1";
    const others = viewers.filter((u) => u.userId !== callerId);
    assert.equal(others.length, 2);
    assert.deepEqual(
      others.map((o) => o.userId),
      ["u2", "u3"],
    );
  });
});

describe("Ticket Detail Realtime State Sync Contracts", () => {
  interface TicketRecord {
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
  }

  it("preserves uncommitted local input edits when incoming realtime event updates other fields", () => {
    const prevServerTicket: TicketRecord = {
      id: "t-100",
      organization_id: "org-1",
      title: "Original Title",
      description: "Original Description",
      status: "open",
      priority: "medium",
      created_by: "u-author",
      assigned_to: null,
      created_at: "2026-11-04T00:00:00.000Z",
      updated_at: "2026-11-04T00:00:00.000Z",
    };

    // Simulated local form state where user has typed a new title but not saved yet
    const localFormState = {
      title: "My Pending Draft Title",
      description: "Original Description", // untouched
      status: "open" as TicketStatus, // untouched
      priority: "medium" as TicketPriority, // untouched
      assignedTo: "", // untouched
    };

    // Incoming realtime update (e.g., teammate moved status to in_progress and assigned to bob)
    const incomingRealtimeTicket: TicketRecord = {
      ...prevServerTicket,
      status: "in_progress",
      assigned_to: "u-bob",
      updated_at: "2026-11-04T00:05:00.000Z",
    };

    // Apply reconciliation rule
    const reconciledTitle =
      localFormState.title === prevServerTicket.title
        ? incomingRealtimeTicket.title
        : localFormState.title;

    const reconciledDescription =
      localFormState.description === (prevServerTicket.description || "")
        ? incomingRealtimeTicket.description || ""
        : localFormState.description;

    const reconciledStatus =
      localFormState.status === prevServerTicket.status
        ? incomingRealtimeTicket.status
        : localFormState.status;

    const reconciledAssignedTo =
      localFormState.assignedTo === (prevServerTicket.assigned_to || "")
        ? incomingRealtimeTicket.assigned_to || ""
        : localFormState.assignedTo;

    // Verify title draft is preserved
    assert.equal(reconciledTitle, "My Pending Draft Title");
    // Verify untouched fields updated live from the incoming event
    assert.equal(reconciledStatus, "in_progress");
    assert.equal(reconciledAssignedTo, "u-bob");
    assert.equal(reconciledDescription, "Original Description");
  });

  it("appends and deduplicates incoming realtime activity records into timeline", () => {
    const existingActivities: ActivityItem[] = [
      {
        id: "act-1",
        ticket_id: "t-100",
        organization_id: "org-1",
        actor_id: "u-author",
        activity_type: "created",
        old_value: null,
        new_value: "open",
        metadata: {},
        created_at: "2026-11-04T00:00:00.000Z",
        actor: { id: "u-author", full_name: "Alice", email: "alice@example.com" },
      },
    ];

    const incomingActivity: ActivityItem = {
      id: "act-2",
      ticket_id: "t-100",
      organization_id: "org-1",
      actor_id: "u-bob",
      activity_type: "status_changed",
      old_value: "open",
      new_value: "in_progress",
      metadata: {},
      created_at: "2026-11-04T00:05:00.000Z",
      actor: { id: "u-bob", full_name: "Bob", email: "bob@example.com" },
    };

    // Prepend new activity into descending timeline
    let timeline = existingActivities.some((a) => a.id === incomingActivity.id)
      ? existingActivities
      : [incomingActivity, ...existingActivities];

    assert.equal(timeline.length, 2);
    assert.equal(timeline[0].id, "act-2");
    assert.equal(timeline[0].activity_type, "status_changed");

    // Duplicate arrival should be ignored
    timeline = timeline.some((a) => a.id === incomingActivity.id)
      ? timeline
      : [incomingActivity, ...timeline];

    assert.equal(timeline.length, 2);
  });
});
