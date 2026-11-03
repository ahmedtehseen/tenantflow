import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PresenceUser, RealtimeTicketEvent } from "../../src/types/database.ts";
// @ts-expect-error TS5097: Node ESM requires .ts extension under --experimental-strip-types
import { formatPresenceUser, aggregateWorkspacePresence, filterTicketViewers } from "../../src/lib/realtime/presence.ts";

describe("Realtime Types Contract", () => {
  it("defines PresenceUser shape correctly", () => {
    const user: PresenceUser = {
      userId: "u-123",
      email: "engineer@tenantflow.io",
      fullName: "Jane Doe",
      role: "member",
      avatarUrl: null,
      currentView: "kanban",
      viewingTicketId: null,
      onlineAt: "2026-11-04T00:00:00.000Z",
    };
    assert.equal(user.userId, "u-123");
    assert.equal(user.role, "member");
    assert.equal(user.email, "engineer@tenantflow.io");
    assert.equal(user.fullName, "Jane Doe");
    assert.equal(user.avatarUrl, null);
    assert.equal(user.currentView, "kanban");
    assert.equal(user.viewingTicketId, null);
    assert.equal(user.onlineAt, "2026-11-04T00:00:00.000Z");
  });

  it("defines RealtimeTicketEvent shape correctly", () => {
    const event: RealtimeTicketEvent = {
      eventType: "UPDATE",
      new: { id: "t-1", status: "in_progress" },
      old: { id: "t-1", status: "open" },
    };
    assert.equal(event.eventType, "UPDATE");
    assert.equal(event.new.status, "in_progress");
    assert.equal(event.old.status, "open");
  });
});

describe("formatPresenceUser", () => {
  it("formats user object with current timestamp and provided fields", () => {
    const before = Date.now();
    const user = formatPresenceUser({
      userId: "u-1",
      email: "alice@example.com",
      fullName: "Alice Smith",
      role: "admin",
      avatarUrl: "https://example.com/avatar.png",
      currentView: "kanban",
      viewingTicketId: null,
    });
    const after = Date.now();

    assert.equal(user.userId, "u-1");
    assert.equal(user.email, "alice@example.com");
    assert.equal(user.fullName, "Alice Smith");
    assert.equal(user.role, "admin");
    assert.equal(user.avatarUrl, "https://example.com/avatar.png");
    assert.equal(user.currentView, "kanban");
    assert.equal(user.viewingTicketId, null);

    const onlineTime = Date.parse(user.onlineAt);
    assert.ok(!Number.isNaN(onlineTime));
    assert.ok(onlineTime >= before && onlineTime <= after);
  });

  it("applies default values for optional parameters", () => {
    const user = formatPresenceUser({
      userId: "u-2",
      email: "bob@example.com",
      fullName: null,
      role: "member",
    });

    assert.equal(user.userId, "u-2");
    assert.equal(user.email, "bob@example.com");
    assert.equal(user.fullName, null);
    assert.equal(user.role, "member");
    assert.equal(user.avatarUrl, null);
    assert.equal(user.currentView, "kanban");
    assert.equal(user.viewingTicketId, null);
    assert.ok(!Number.isNaN(Date.parse(user.onlineAt)));
  });

  it("infers ticket view when viewingTicketId is set without currentView", () => {
    const user = formatPresenceUser({
      userId: "u-3",
      email: "carol@example.com",
      fullName: "Carol Danvers",
      role: "owner",
      viewingTicketId: "ticket-456",
    });

    assert.equal(user.viewingTicketId, "ticket-456");
    assert.equal(user.currentView, "ticket");
  });
});

describe("aggregateWorkspacePresence", () => {
  it("flattens multi-key Supabase presence state into a single list", () => {
    const rawState: Record<string, PresenceUser[]> = {
      "session-1": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          onlineAt: "2026-11-04T00:01:00.000Z",
        },
      ],
      "session-2": [
        {
          userId: "u-2",
          email: "bob@example.com",
          fullName: "Bob Jones",
          role: "member",
          onlineAt: "2026-11-04T00:02:00.000Z",
        },
      ],
    };

    const result = aggregateWorkspacePresence(rawState);
    assert.equal(result.length, 2);
    assert.equal(result[0].userId, "u-1");
    assert.equal(result[1].userId, "u-2");
  });

  it("deduplicates multi-tab sessions for the same user, keeping latest onlineAt", () => {
    const rawState: Record<string, PresenceUser[]> = {
      "tab-1": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          currentView: "kanban",
          onlineAt: "2026-11-04T00:01:00.000Z",
        },
      ],
      "tab-2": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          currentView: "kanban",
          onlineAt: "2026-11-04T00:05:00.000Z",
        },
      ],
    };

    const result = aggregateWorkspacePresence(rawState);
    assert.equal(result.length, 1);
    assert.equal(result[0].userId, "u-1");
    assert.equal(result[0].onlineAt, "2026-11-04T00:05:00.000Z");
  });

  it("preserves active ticket view session over a newer board-browsing session", () => {
    const rawState: Record<string, PresenceUser[]> = {
      "tab-ticket": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          currentView: "ticket",
          viewingTicketId: "t-100",
          onlineAt: "2026-11-04T00:01:00.000Z",
        },
      ],
      "tab-board": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          currentView: "kanban",
          viewingTicketId: null,
          onlineAt: "2026-11-04T00:05:00.000Z",
        },
      ],
    };

    const result = aggregateWorkspacePresence(rawState);
    assert.equal(result.length, 1);
    assert.equal(result[0].userId, "u-1");
    assert.equal(result[0].viewingTicketId, "t-100");
    assert.equal(result[0].currentView, "ticket");
  });

  it("selects newer ticket session when multiple tabs view tickets", () => {
    const rawState: Record<string, PresenceUser[]> = {
      "tab-old-ticket": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          currentView: "ticket",
          viewingTicketId: "t-1",
          onlineAt: "2026-11-04T00:01:00.000Z",
        },
      ],
      "tab-new-ticket": [
        {
          userId: "u-1",
          email: "alice@example.com",
          fullName: "Alice Smith",
          role: "admin",
          currentView: "ticket",
          viewingTicketId: "t-2",
          onlineAt: "2026-11-04T00:08:00.000Z",
        },
      ],
    };

    const result = aggregateWorkspacePresence(rawState);
    assert.equal(result.length, 1);
    assert.equal(result[0].userId, "u-1");
    assert.equal(result[0].viewingTicketId, "t-2");
  });

  it("sorts users alphabetically by fullName or email fallback", () => {
    const rawState: Record<string, PresenceUser[]> = {
      "s-1": [
        {
          userId: "u-z",
          email: "zoe@example.com",
          fullName: "Zoe Adams",
          role: "member",
          onlineAt: "2026-11-04T00:00:00.000Z",
        },
      ],
      "s-2": [
        {
          userId: "u-no-name",
          email: "brian@example.com",
          fullName: null,
          role: "member",
          onlineAt: "2026-11-04T00:00:00.000Z",
        },
      ],
      "s-3": [
        {
          userId: "u-a",
          email: "alex@example.com",
          fullName: "Alex Rivera",
          role: "owner",
          onlineAt: "2026-11-04T00:00:00.000Z",
        },
      ],
    };

    const result = aggregateWorkspacePresence(rawState);
    assert.equal(result.length, 3);
    assert.equal(result[0].userId, "u-a"); // Alex Rivera
    assert.equal(result[1].userId, "u-no-name"); // brian@example.com
    assert.equal(result[2].userId, "u-z"); // Zoe Adams
  });

  it("handles empty or missing presence states gracefully", () => {
    assert.deepEqual(aggregateWorkspacePresence({}), []);
    assert.deepEqual(aggregateWorkspacePresence({ "empty-key": [] }), []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.deepEqual(aggregateWorkspacePresence(null as any), []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.deepEqual(aggregateWorkspacePresence(undefined as any), []);
  });
});

describe("filterTicketViewers", () => {
  const users: PresenceUser[] = [
    {
      userId: "u-1",
      email: "alice@example.com",
      fullName: "Alice Smith",
      role: "admin",
      currentView: "ticket",
      viewingTicketId: "ticket-abc",
      onlineAt: "2026-11-04T00:00:00.000Z",
    },
    {
      userId: "u-2",
      email: "bob@example.com",
      fullName: "Bob Jones",
      role: "member",
      currentView: "ticket",
      viewingTicketId: "ticket-xyz",
      onlineAt: "2026-11-04T00:00:00.000Z",
    },
    {
      userId: "u-3",
      email: "carol@example.com",
      fullName: "Carol Danvers",
      role: "owner",
      currentView: "kanban",
      viewingTicketId: null,
      onlineAt: "2026-11-04T00:00:00.000Z",
    },
    {
      userId: "u-4",
      email: "dave@example.com",
      fullName: "Dave Miller",
      role: "member",
      currentView: "ticket",
      viewingTicketId: "ticket-abc",
      onlineAt: "2026-11-04T00:00:00.000Z",
    },
  ];

  it("returns only users currently viewing target ticket", () => {
    const viewers = filterTicketViewers(users, "ticket-abc");
    assert.equal(viewers.length, 2);
    assert.equal(viewers[0].userId, "u-1");
    assert.equal(viewers[1].userId, "u-4");
  });

  it("excludes users on other tickets or general board view", () => {
    const viewers = filterTicketViewers(users, "ticket-xyz");
    assert.equal(viewers.length, 1);
    assert.equal(viewers[0].userId, "u-2");
  });

  it("returns empty array when no users are viewing target ticket", () => {
    const viewers = filterTicketViewers(users, "ticket-nonexistent");
    assert.deepEqual(viewers, []);
  });

  it("handles empty or invalid inputs gracefully", () => {
    assert.deepEqual(filterTicketViewers([], "ticket-abc"), []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.deepEqual(filterTicketViewers(null as any, "ticket-abc"), []);
    assert.deepEqual(filterTicketViewers(users, ""), []);
  });
});
