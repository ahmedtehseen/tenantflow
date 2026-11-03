import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionTicket,
  canEditTicket,
  canReassignTicket,
  getAvailableNextStatuses,
  FSM_EDGES,
  VALID_STATUSES,
  type TicketActorContext,
  type TicketLifecycleTarget,
  type TicketStatus,
} from "#tickets/lifecycle";

describe("Ticket Lifecycle Finite State Machine (ADR 0004)", () => {
  // Test actors fixture
  const authorMember: TicketActorContext = { id: "user_author", role: "member" };
  const assigneeMember: TicketActorContext = { id: "user_assignee", role: "member" };
  const bystanderMember: TicketActorContext = { id: "user_bystander", role: "member" };
  const adminActor: TicketActorContext = { id: "user_admin", role: "admin" };
  const ownerActor: TicketActorContext = { id: "user_owner", role: "owner" };

  const createTicket = (
    status: TicketStatus,
    createdBy: string = "user_author",
    assignedTo: string | null = "user_assignee",
  ): TicketLifecycleTarget => ({
    id: "ticket_123",
    status,
    created_by: createdBy,
    assigned_to: assignedTo,
  });

  describe("FSM specification structure", () => {
    it("defines the canonical legal transitions", () => {
      assert.deepEqual(FSM_EDGES, {
        open: ["in_progress"],
        in_progress: ["resolved", "open"],
        resolved: ["closed", "in_progress"],
        closed: ["open"],
      });
    });

    it("defines valid statuses", () => {
      assert.deepEqual(VALID_STATUSES, ["open", "in_progress", "resolved", "closed"]);
    });
  });

  describe("Validation guards: same status and invalid status", () => {
    it("rejects transition to the exact same status", () => {
      for (const status of VALID_STATUSES) {
        const ticket = createTicket(status);
        const result = canTransitionTicket(ticket, status, adminActor);
        assert.equal(result.allowed, false);
        assert.match(result.reason ?? "", /already in status/i);
      }
    });

    it("rejects transition to an unrecognized status", () => {
      const ticket = createTicket("open");
      const result = canTransitionTicket(ticket, "archived" as TicketStatus, adminActor);
      assert.equal(result.allowed, false);
      assert.match(result.reason ?? "", /not a recognized ticket status/i);
    });
  });

  describe("Transitions from: open", () => {
    it("allows open -> in_progress for any member when ticket is unassigned", () => {
      const ticket = createTicket("open", "user_author", null);
      assert.equal(canTransitionTicket(ticket, "in_progress", bystanderMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", assigneeMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", authorMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", ownerActor).allowed, true);
    });

    it("allows open -> in_progress for assignee, admin, or owner when ticket is assigned", () => {
      const ticket = createTicket("open", "user_author", "user_assignee");
      assert.equal(canTransitionTicket(ticket, "in_progress", assigneeMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", ownerActor).allowed, true);
    });

    it("rejects open -> in_progress for bystander member when ticket is assigned to another user", () => {
      const ticket = createTicket("open", "user_author", "user_assignee");
      const bystanderRes = canTransitionTicket(ticket, "in_progress", bystanderMember);
      assert.equal(bystanderRes.allowed, false);
      assert.equal(
        bystanderRes.reason,
        "This ticket is assigned to another team member. Only the assignee, workspace admin, or owner can start work on it.",
      );

      const authorRes = canTransitionTicket(ticket, "in_progress", authorMember);
      assert.equal(authorRes.allowed, false);
      assert.equal(
        authorRes.reason,
        "This ticket is assigned to another team member. Only the assignee, workspace admin, or owner can start work on it.",
      );
    });

    it("rejects illegal jumps open -> resolved for all roles", () => {
      const ticket = createTicket("open");
      for (const actor of [authorMember, assigneeMember, bystanderMember, adminActor, ownerActor]) {
        const result = canTransitionTicket(ticket, "resolved", actor);
        assert.equal(result.allowed, false);
        assert.match(result.reason ?? "", /Invalid transition/i);
      }
    });

    it("rejects illegal jumps open -> closed for all roles", () => {
      const ticket = createTicket("open");
      for (const actor of [authorMember, assigneeMember, bystanderMember, adminActor, ownerActor]) {
        const result = canTransitionTicket(ticket, "closed", actor);
        assert.equal(result.allowed, false);
        assert.match(result.reason ?? "", /Invalid transition/i);
      }
    });
  });

  describe("Transitions from: in_progress", () => {
    it("allows in_progress -> resolved for assignee, admin, and owner", () => {
      const ticket = createTicket("in_progress");
      assert.equal(canTransitionTicket(ticket, "resolved", assigneeMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "resolved", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "resolved", ownerActor).allowed, true);
    });

    it("rejects in_progress -> resolved for non-assignee standard members (including author)", () => {
      const ticket = createTicket("in_progress");
      const bystanderRes = canTransitionTicket(ticket, "resolved", bystanderMember);
      assert.equal(bystanderRes.allowed, false);
      assert.match(bystanderRes.reason ?? "", /assigned member, workspace admin, or owner/i);

      const authorRes = canTransitionTicket(ticket, "resolved", authorMember);
      assert.equal(authorRes.allowed, false);
      assert.match(authorRes.reason ?? "", /assigned member, workspace admin, or owner/i);
    });

    it("allows in_progress -> open for assignee, admin, and owner (un-starting work)", () => {
      const ticket = createTicket("in_progress");
      assert.equal(canTransitionTicket(ticket, "open", assigneeMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "open", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "open", ownerActor).allowed, true);
    });

    it("rejects in_progress -> open for non-assignee standard members", () => {
      const ticket = createTicket("in_progress");
      const bystanderRes = canTransitionTicket(ticket, "open", bystanderMember);
      assert.equal(bystanderRes.allowed, false);
      assert.match(bystanderRes.reason ?? "", /assigned member, admin, or owner/i);

      const authorRes = canTransitionTicket(ticket, "open", authorMember);
      assert.equal(authorRes.allowed, false);
      assert.match(authorRes.reason ?? "", /assigned member, admin, or owner/i);
    });

    it("rejects direct jump in_progress -> closed", () => {
      const ticket = createTicket("in_progress");
      for (const actor of [authorMember, assigneeMember, bystanderMember, adminActor, ownerActor]) {
        const result = canTransitionTicket(ticket, "closed", actor);
        assert.equal(result.allowed, false);
        assert.match(result.reason ?? "", /Invalid transition/i);
      }
    });
  });

  describe("Transitions from: resolved", () => {
    it("allows resolved -> closed for ticket author, admin, and owner", () => {
      const ticket = createTicket("resolved");
      assert.equal(canTransitionTicket(ticket, "closed", authorMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "closed", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "closed", ownerActor).allowed, true);
    });

    it("rejects resolved -> closed for non-author member even if assigned", () => {
      const ticket = createTicket("resolved");
      const assigneeRes = canTransitionTicket(ticket, "closed", assigneeMember);
      assert.equal(assigneeRes.allowed, false);
      assert.match(assigneeRes.reason ?? "", /ticket author, workspace admin, or owner/i);

      const bystanderRes = canTransitionTicket(ticket, "closed", bystanderMember);
      assert.equal(bystanderRes.allowed, false);
      assert.match(bystanderRes.reason ?? "", /ticket author, workspace admin, or owner/i);
    });

    it("allows resolved -> in_progress for author, assignee, admin, and owner", () => {
      const ticket = createTicket("resolved");
      assert.equal(canTransitionTicket(ticket, "in_progress", authorMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", assigneeMember).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "in_progress", ownerActor).allowed, true);
    });

    it("rejects resolved -> in_progress for unrelated bystander member", () => {
      const ticket = createTicket("resolved");
      const res = canTransitionTicket(ticket, "in_progress", bystanderMember);
      assert.equal(res.allowed, false);
      assert.match(res.reason ?? "", /author, assignee, admin, or owner/i);
    });

    it("rejects direct jump resolved -> open", () => {
      const ticket = createTicket("resolved");
      for (const actor of [authorMember, assigneeMember, bystanderMember, adminActor, ownerActor]) {
        const result = canTransitionTicket(ticket, "open", actor);
        assert.equal(result.allowed, false);
        assert.match(result.reason ?? "", /Invalid transition/i);
      }
    });
  });

  describe("Transitions from: closed", () => {
    it("allows closed -> open for admin and owner only", () => {
      const ticket = createTicket("closed");
      assert.equal(canTransitionTicket(ticket, "open", adminActor).allowed, true);
      assert.equal(canTransitionTicket(ticket, "open", ownerActor).allowed, true);
    });

    it("rejects closed -> open for standard members (even author or assignee)", () => {
      const ticket = createTicket("closed");
      const authorRes = canTransitionTicket(ticket, "open", authorMember);
      assert.equal(authorRes.allowed, false);
      assert.match(authorRes.reason ?? "", /Admin or Owner/i);

      const assigneeRes = canTransitionTicket(ticket, "open", assigneeMember);
      assert.equal(assigneeRes.allowed, false);
      assert.match(assigneeRes.reason ?? "", /Admin or Owner/i);

      const bystanderRes = canTransitionTicket(ticket, "open", bystanderMember);
      assert.equal(bystanderRes.allowed, false);
      assert.match(bystanderRes.reason ?? "", /Admin or Owner/i);
    });

    it("rejects direct transitions closed -> in_progress and closed -> resolved", () => {
      const ticket = createTicket("closed");
      for (const actor of [adminActor, ownerActor, authorMember]) {
        const inProgressRes = canTransitionTicket(ticket, "in_progress", actor);
        assert.equal(inProgressRes.allowed, false);
        assert.match(inProgressRes.reason ?? "", /Invalid transition/i);

        const resolvedRes = canTransitionTicket(ticket, "resolved", actor);
        assert.equal(resolvedRes.allowed, false);
        assert.match(resolvedRes.reason ?? "", /Invalid transition/i);
      }
    });
  });

  describe("getAvailableNextStatuses helper", () => {
    it("returns [in_progress] for any user when ticket is open and unassigned", () => {
      const ticket = createTicket("open", "user_author", null);
      assert.deepEqual(getAvailableNextStatuses(ticket, bystanderMember), ["in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, assigneeMember), ["in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, adminActor), ["in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, ownerActor), ["in_progress"]);
    });

    it("returns [in_progress] only for assignee, admin, owner when ticket is open and assigned", () => {
      const ticket = createTicket("open", "user_author", "user_assignee");
      assert.deepEqual(getAvailableNextStatuses(ticket, assigneeMember), ["in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, adminActor), ["in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, ownerActor), ["in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, bystanderMember), []);
      assert.deepEqual(getAvailableNextStatuses(ticket, authorMember), []);
    });

    it("returns [resolved, open] for assignee, admin, owner when in_progress; [] for bystander/author", () => {
      const ticket = createTicket("in_progress");
      assert.deepEqual(getAvailableNextStatuses(ticket, assigneeMember), ["resolved", "open"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, adminActor), ["resolved", "open"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, ownerActor), ["resolved", "open"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, authorMember), []);
      assert.deepEqual(getAvailableNextStatuses(ticket, bystanderMember), []);
    });

    it("returns appropriate next statuses when ticket is resolved", () => {
      const ticket = createTicket("resolved");
      // Author can close or send back to in_progress
      assert.deepEqual(getAvailableNextStatuses(ticket, authorMember), ["closed", "in_progress"]);
      // Assignee cannot close, but can send back to in_progress
      assert.deepEqual(getAvailableNextStatuses(ticket, assigneeMember), ["in_progress"]);
      // Admin/Owner can do both
      assert.deepEqual(getAvailableNextStatuses(ticket, adminActor), ["closed", "in_progress"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, ownerActor), ["closed", "in_progress"]);
      // Bystander cannot do either
      assert.deepEqual(getAvailableNextStatuses(ticket, bystanderMember), []);
    });

    it("returns [open] only for admin/owner when ticket is closed; [] for members", () => {
      const ticket = createTicket("closed");
      assert.deepEqual(getAvailableNextStatuses(ticket, adminActor), ["open"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, ownerActor), ["open"]);
      assert.deepEqual(getAvailableNextStatuses(ticket, authorMember), []);
      assert.deepEqual(getAvailableNextStatuses(ticket, assigneeMember), []);
      assert.deepEqual(getAvailableNextStatuses(ticket, bystanderMember), []);
    });
  });

  describe("canEditTicket RBAC evaluation", () => {
    it("allows ticket owner", () => {
      const ticket = createTicket("open");
      const result = canEditTicket(ticket, ownerActor);
      assert.equal(result.allowed, true);
    });

    it("allows workspace admin", () => {
      const ticket = createTicket("open");
      const result = canEditTicket(ticket, adminActor);
      assert.equal(result.allowed, true);
    });

    it("allows ticket author", () => {
      const ticket = createTicket("open", "user_author", "user_other");
      const result = canEditTicket(ticket, authorMember);
      assert.equal(result.allowed, true);
    });

    it("allows ticket assignee", () => {
      const ticket = createTicket("open", "user_other", "user_assignee");
      const result = canEditTicket(ticket, assigneeMember);
      assert.equal(result.allowed, true);
    });

    it("rejects bystander member with clear reason", () => {
      const ticket = createTicket("open", "user_author", "user_assignee");
      const result = canEditTicket(ticket, bystanderMember);
      assert.equal(result.allowed, false);
      assert.equal(
        result.reason,
        "You do not have permission to edit this ticket. Only the assignee, author, or workspace admins can make changes.",
      );
    });
  });

  describe("canReassignTicket RBAC evaluation", () => {
    it("allows ticket owner", () => {
      const ticket = createTicket("open");
      const result = canReassignTicket(ticket, ownerActor);
      assert.equal(result.allowed, true);
    });

    it("allows workspace admin", () => {
      const ticket = createTicket("open");
      const result = canReassignTicket(ticket, adminActor);
      assert.equal(result.allowed, true);
    });

    it("allows ticket author", () => {
      const ticket = createTicket("open", "user_author", "user_other");
      const result = canReassignTicket(ticket, authorMember);
      assert.equal(result.allowed, true);
    });

    it("allows ticket assignee", () => {
      const ticket = createTicket("open", "user_other", "user_assignee");
      const result = canReassignTicket(ticket, assigneeMember);
      assert.equal(result.allowed, true);
    });

    it("rejects bystander member with clear reason", () => {
      const ticket = createTicket("open", "user_author", "user_assignee");
      const result = canReassignTicket(ticket, bystanderMember);
      assert.equal(result.allowed, false);
      assert.equal(
        result.reason,
        "You do not have permission to reassign this ticket. Only the assignee, author, or workspace admins can change the assignee.",
      );
    });
  });
});
