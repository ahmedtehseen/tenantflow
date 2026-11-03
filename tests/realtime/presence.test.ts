import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PresenceUser, RealtimeTicketEvent } from "../../src/types/database.ts";

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
