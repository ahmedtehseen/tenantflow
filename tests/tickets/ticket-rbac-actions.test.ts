import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTicketUpdateRBAC,
  buildTicketDiffActivities,
  buildTicketCreatedActivity,
  buildTicketStatusChangedActivity,
} from "#tickets/lifecycle";
import type { TicketLifecycleTarget, TicketActorContext } from "#tickets/lifecycle";
import type { TicketPriority } from "#types/database";

describe("Ticket Server Action RBAC & Activity Audit Log (ADR 0005)", () => {
  const authorUser: TicketActorContext = {
    id: "user-author-111",
    role: "member",
  };

  const assigneeUser: TicketActorContext = {
    id: "user-assignee-222",
    role: "member",
  };

  const bystanderMember: TicketActorContext = {
    id: "user-bystander-333",
    role: "member",
  };

  const adminUser: TicketActorContext = {
    id: "user-admin-444",
    role: "admin",
  };

  const ownerUser: TicketActorContext = {
    id: "user-owner-555",
    role: "owner",
  };

  const baseTicket: TicketLifecycleTarget & {
    title: string;
    description: string | null;
    priority: TicketPriority;
  } = {
    id: "ticket-aaa-111",
    status: "open",
    priority: "medium",
    title: "Initial Ticket Title",
    description: "Initial description text",
    created_by: authorUser.id,
    assigned_to: assigneeUser.id,
  };

  describe("validateTicketUpdateRBAC permissions", () => {
    it("rejects non-author, non-assignee standard member edit attempts with clear permission error", () => {
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "open",
          assigned_to: assigneeUser.id,
        },
        bystanderMember,
      );

      assert.equal(evaluation.allowed, false);
      assert.match(
        evaluation.reason || "",
        /You do not have permission to edit this ticket\. Only the assignee, author, or workspace admins can make changes\./,
      );
    });

    it("rejects bystander member attempting to change assigned_to", () => {
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "open",
          assigned_to: "user-new-assignee-999",
        },
        bystanderMember,
      );

      assert.equal(evaluation.allowed, false);
      assert.ok(
        evaluation.reason?.includes("You do not have permission to edit this ticket") ||
          evaluation.reason?.includes("You do not have permission to reassign this ticket"),
      );
    });

    it("allows ticket author (member role) to update ticket properties", () => {
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "open",
          assigned_to: "user-new-assignee-999",
        },
        authorUser,
      );

      assert.equal(evaluation.allowed, true);
    });

    it("allows ticket assignee (member role) to update ticket properties", () => {
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "open",
          assigned_to: null,
        },
        assigneeUser,
      );

      assert.equal(evaluation.allowed, true);
    });

    it("allows workspace admin to update ticket properties and reassign", () => {
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "open",
          assigned_to: adminUser.id,
        },
        adminUser,
      );

      assert.equal(evaluation.allowed, true);
    });

    it("allows workspace owner to update ticket properties and reassign", () => {
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "open",
          assigned_to: ownerUser.id,
        },
        ownerUser,
      );

      assert.equal(evaluation.allowed, true);
    });

    it("rejects illegal status transition even if the actor has edit permissions", () => {
      // open -> resolved is an illegal transition in FSM
      const evaluation = validateTicketUpdateRBAC(
        baseTicket,
        {
          status: "resolved",
          assigned_to: assigneeUser.id,
        },
        authorUser,
      );

      assert.equal(evaluation.allowed, false);
      assert.match(evaluation.reason || "", /Invalid transition from "open" to "resolved"/);
    });
  });

  describe("buildTicketDiffActivities helper", () => {
    const orgId = "org-123";
    const ticketId = "ticket-aaa-111";
    const actorId = "user-author-111";

    it("generates status_changed activity when status changes", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Sample title",
          description: "Sample desc",
        },
        updated: {
          status: "in_progress",
          priority: "medium",
          assigned_to: "user-1",
          title: "Sample title",
          description: "Sample desc",
        },
      });

      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0], {
        organization_id: orgId,
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: "status_changed",
        old_value: "open",
        new_value: "in_progress",
      });
    });

    it("generates priority_changed activity when priority changes", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "low",
          assigned_to: "user-1",
          title: "Sample title",
          description: "Sample desc",
        },
        updated: {
          status: "open",
          priority: "urgent",
          assigned_to: "user-1",
          title: "Sample title",
          description: "Sample desc",
        },
      });

      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0], {
        organization_id: orgId,
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: "priority_changed",
        old_value: "low",
        new_value: "urgent",
      });
    });

    it("generates assignee_changed activity when assigned_to changes", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Sample title",
          description: "Sample desc",
        },
        updated: {
          status: "open",
          priority: "medium",
          assigned_to: "user-2",
          title: "Sample title",
          description: "Sample desc",
        },
      });

      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0], {
        organization_id: orgId,
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: "assignee_changed",
        old_value: "user-1",
        new_value: "user-2",
      });
    });

    it("generates assignee_changed activity when unassigned", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Sample title",
          description: "Sample desc",
        },
        updated: {
          status: "open",
          priority: "medium",
          assigned_to: null,
          title: "Sample title",
          description: "Sample desc",
        },
      });

      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0], {
        organization_id: orgId,
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: "assignee_changed",
        old_value: "user-1",
        new_value: null,
      });
    });

    it("generates details_updated activity when title changes", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Old title",
          description: "Same desc",
        },
        updated: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "New title",
          description: "Same desc",
        },
      });

      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0], {
        organization_id: orgId,
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: "details_updated",
        old_value: null,
        new_value: null,
        metadata: { title_changed: true },
      });
    });

    it("generates details_updated activity when description changes", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Same title",
          description: "Old description",
        },
        updated: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Same title",
          description: "Updated description",
        },
      });

      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0], {
        organization_id: orgId,
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: "details_updated",
        old_value: null,
        new_value: null,
        metadata: { title_changed: false },
      });
    });

    it("returns empty array when nothing has changed", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Same title",
          description: "Same description",
        },
        updated: {
          status: "open",
          priority: "medium",
          assigned_to: "user-1",
          title: "Same title",
          description: "Same description",
        },
      });

      assert.equal(activities.length, 0);
    });

    it("generates multiple activities when multiple fields change simultaneously", () => {
      const activities = buildTicketDiffActivities({
        organizationId: orgId,
        ticketId,
        actorId,
        current: {
          status: "open",
          priority: "low",
          assigned_to: "user-1",
          title: "Old title",
          description: "Old desc",
        },
        updated: {
          status: "in_progress",
          priority: "high",
          assigned_to: "user-2",
          title: "New title",
          description: "New desc",
        },
      });

      assert.equal(activities.length, 4);
      assert.equal(activities[0].activity_type, "status_changed");
      assert.equal(activities[1].activity_type, "priority_changed");
      assert.equal(activities[2].activity_type, "assignee_changed");
      assert.equal(activities[3].activity_type, "details_updated");
    });
  });

  describe("buildTicketCreatedActivity helper", () => {
    it("generates created activity record with status and metadata", () => {
      const activity = buildTicketCreatedActivity({
        organizationId: "org-123",
        ticketId: "ticket-new-999",
        actorId: "user-creator-111",
        status: "open",
        priority: "high",
        assigned_to: "user-assignee-222",
      });

      assert.deepEqual(activity, {
        organization_id: "org-123",
        ticket_id: "ticket-new-999",
        actor_id: "user-creator-111",
        activity_type: "created",
        old_value: null,
        new_value: "open",
        metadata: {
          priority: "high",
          assigned_to: "user-assignee-222",
        },
      });
    });
  });

  describe("buildTicketStatusChangedActivity helper", () => {
    it("generates status_changed activity record", () => {
      const activity = buildTicketStatusChangedActivity({
        organizationId: "org-123",
        ticketId: "ticket-111",
        actorId: "user-1",
        oldStatus: "open",
        newStatus: "in_progress",
      });

      assert.deepEqual(activity, {
        organization_id: "org-123",
        ticket_id: "ticket-111",
        actor_id: "user-1",
        activity_type: "status_changed",
        old_value: "open",
        new_value: "in_progress",
      });
    });
  });
});
