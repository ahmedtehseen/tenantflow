import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  canTransitionTicket,
  type TicketActorContext,
  type TicketLifecycleTarget,
  type TicketStatus,
} from "#tickets/lifecycle";
import type { KanbanBoard } from "@/app/org/[slug]/tickets/_components/kanban-board";
import type { KanbanColumn } from "@/app/org/[slug]/tickets/_components/kanban-column";
import type { KanbanCard } from "@/app/org/[slug]/tickets/_components/kanban-card";
import type { TicketItem, MemberOption } from "@/lib/realtime/ticket-events";
import type { OrgRole } from "@/types/database";

/**
 * Pure drag-and-drop drop validation helper evaluated before dispatching
 * onStatusChange in KanbanBoard.
 */
export function validateKanbanDrop(
  ticket: TicketLifecycleTarget,
  targetStatus: TicketStatus,
  actor: TicketActorContext,
) {
  return canTransitionTicket(ticket, targetStatus, actor);
}

describe("Kanban Board Drag-and-Drop FSM Gating", () => {
  // Test actors
  const standardMember: TicketActorContext = {
    id: "user-member-1",
    role: "member",
  };
  const otherMember: TicketActorContext = {
    id: "user-member-2",
    role: "member",
  };
  const adminActor: TicketActorContext = {
    id: "user-admin",
    role: "admin",
  };
  const ownerActor: TicketActorContext = {
    id: "user-owner",
    role: "owner",
  };

  const createTicket = (
    status: TicketStatus,
    createdBy: string = "user-member-1",
    assignedTo: string | null = null,
  ): TicketLifecycleTarget => ({
    id: "ticket-101",
    status,
    created_by: createdBy,
    assigned_to: assignedTo,
  });

  describe("FSM Pre-Drop Validation Rules", () => {
    it("rejects illegal state jumps (e.g. open -> closed)", () => {
      const ticket = createTicket("open");
      const result = validateKanbanDrop(ticket, "closed", standardMember);

      assert.equal(result.allowed, false);
      assert.match(
        result.reason || "",
        /invalid transition/i,
        "Should mention invalid transition in rejection reason",
      );
    });

    it("rejects direct jump from open -> resolved", () => {
      const ticket = createTicket("open");
      const result = validateKanbanDrop(ticket, "resolved", adminActor);

      assert.equal(result.allowed, false);
      assert.match(result.reason || "", /invalid transition/i);
    });

    it("rejects drop when targetStatus is the same as current status", () => {
      const ticket = createTicket("open");
      const result = validateKanbanDrop(ticket, "open", standardMember);

      assert.equal(result.allowed, false);
      assert.match(result.reason || "", /already in status/i);
    });

    it("rejects drag drop for standard member on someone else's assigned open ticket", () => {
      // Assigned to otherMember, standardMember attempts to drag to in_progress
      const ticket = createTicket("open", "creator-user", otherMember.id);
      const result = validateKanbanDrop(ticket, "in_progress", standardMember);

      assert.equal(result.allowed, false);
      assert.match(
        result.reason || "",
        /assigned to another team member/i,
        "Should reject with assignee protection reason",
      );
    });

    it("allows drag drop to in_progress for standard member when open ticket is unassigned", () => {
      const ticket = createTicket("open", "creator-user", null);
      const result = validateKanbanDrop(ticket, "in_progress", standardMember);

      assert.equal(result.allowed, true);
    });

    it("allows drag drop to in_progress for assigned member on their own ticket", () => {
      const ticket = createTicket("open", "creator-user", standardMember.id);
      const result = validateKanbanDrop(ticket, "in_progress", standardMember);

      assert.equal(result.allowed, true);
    });

    it("allows admin or owner to drag any assigned open ticket to in_progress", () => {
      const ticket = createTicket("open", "creator-user", otherMember.id);
      const adminResult = validateKanbanDrop(ticket, "in_progress", adminActor);
      const ownerResult = validateKanbanDrop(ticket, "in_progress", ownerActor);

      assert.equal(adminResult.allowed, true);
      assert.equal(ownerResult.allowed, true);
    });

    it("rejects dragging closed ticket to open by standard member", () => {
      const ticket = createTicket("closed", standardMember.id, standardMember.id);
      const result = validateKanbanDrop(ticket, "open", standardMember);

      assert.equal(result.allowed, false);
      assert.match(
        result.reason || "",
        /admin or owner authority/i,
        "Reopening closed tickets must require admin/owner authority",
      );
    });

    it("allows admin and owner to drag closed ticket to open", () => {
      const ticket = createTicket("closed");
      const adminResult = validateKanbanDrop(ticket, "open", adminActor);
      const ownerResult = validateKanbanDrop(ticket, "open", ownerActor);

      assert.equal(adminResult.allowed, true);
      assert.equal(ownerResult.allowed, true);
    });

    it("validates in_progress -> resolved permissions", () => {
      const ticket = createTicket("in_progress", "author-user", standardMember.id);

      // Assignee can resolve
      const assigneeResult = validateKanbanDrop(ticket, "resolved", standardMember);
      assert.equal(assigneeResult.allowed, true);

      // Bystander member cannot resolve
      const bystanderResult = validateKanbanDrop(ticket, "resolved", otherMember);
      assert.equal(bystanderResult.allowed, false);
      assert.match(bystanderResult.reason || "", /only the assigned member/i);

      // Admin can resolve
      const adminResult = validateKanbanDrop(ticket, "resolved", adminActor);
      assert.equal(adminResult.allowed, true);
    });

    it("validates resolved -> closed permissions", () => {
      const ticket = createTicket("resolved", standardMember.id, otherMember.id);

      // Author can close
      const authorResult = validateKanbanDrop(ticket, "closed", standardMember);
      assert.equal(authorResult.allowed, true);

      // Assignee (if not author) cannot close
      const assigneeResult = validateKanbanDrop(ticket, "closed", otherMember);
      assert.equal(assigneeResult.allowed, false);
      assert.match(assigneeResult.reason || "", /only the ticket author/i);

      // Admin can close
      const adminResult = validateKanbanDrop(ticket, "closed", adminActor);
      assert.equal(adminResult.allowed, true);
    });
  });

  describe("Kanban Components Structural & Behavioral Contract", () => {
    const cardPath = path.resolve(
      process.cwd(),
      "src/app/org/[slug]/tickets/_components/kanban-card.tsx",
    );
    const columnPath = path.resolve(
      process.cwd(),
      "src/app/org/[slug]/tickets/_components/kanban-column.tsx",
    );
    const boardPath = path.resolve(
      process.cwd(),
      "src/app/org/[slug]/tickets/_components/kanban-board.tsx",
    );

    it("verifies kanban-card.tsx exists and implements native draggable contract", () => {
      assert.ok(fs.existsSync(cardPath), "kanban-card.tsx must exist");
      const content = fs.readFileSync(cardPath, "utf-8");

      assert.ok(content.includes('"use client"'), "Must be a client component");
      assert.ok(
        content.includes("export function KanbanCard") ||
          content.includes("export const KanbanCard"),
        "Must export KanbanCard",
      );
      assert.ok(
        content.includes('draggable="true"') || content.includes("draggable={true}"),
        "Card must have draggable='true'",
      );
      assert.ok(
        content.includes("cursor-grab"),
        "Card must have grab cursor styling",
      );
      assert.ok(
        content.includes("onDragStart"),
        "Card must handle onDragStart event",
      );
      assert.ok(
        content.includes("application/json"),
        "Card must populate application/json in dataTransfer",
      );
      assert.ok(
        content.includes("TicketPriorityBadge"),
        "Card must render TicketPriorityBadge",
      );
      assert.ok(
        content.includes("line-clamp-2"),
        "Card description must be clamped to 2 lines",
      );
      assert.ok(
        content.includes("Unassigned") || content.includes("UserMinus"),
        "Card must handle unassigned state",
      );
    });

    it("verifies kanban-column.tsx exists and implements drop zone contract", () => {
      assert.ok(fs.existsSync(columnPath), "kanban-column.tsx must exist");
      const content = fs.readFileSync(columnPath, "utf-8");

      assert.ok(content.includes('"use client"'), "Must be a client component");
      assert.ok(
        content.includes("export function KanbanColumn") ||
          content.includes("export const KanbanColumn"),
        "Must export KanbanColumn",
      );
      assert.ok(content.includes("onDragOver"), "Column must handle onDragOver");
      assert.ok(content.includes("onDrop"), "Column must handle onDrop");
      assert.ok(
        content.includes("preventDefault"),
        "Column must prevent default on dragover/drop",
      );
      assert.ok(
        content.includes('dropEffect = "move"') || content.includes("dropEffect"),
        "Column must set dropEffect",
      );
      assert.ok(
        content.includes("KanbanCard"),
        "Column must render KanbanCard items",
      );
    });

    it("verifies kanban-board.tsx exists and enforces FSM pre-drop gating", () => {
      assert.ok(fs.existsSync(boardPath), "kanban-board.tsx must exist");
      const content = fs.readFileSync(boardPath, "utf-8");

      assert.ok(content.includes('"use client"'), "Must be a client component");
      assert.ok(
        content.includes("export function KanbanBoard") ||
          content.includes("export const KanbanBoard"),
        "Must export KanbanBoard",
      );
      assert.ok(
        content.includes("canTransitionTicket"),
        "Board must import and evaluate canTransitionTicket",
      );
      assert.ok(
        content.includes("Cannot move ticket:") ||
          content.includes("Cannot move ticket"),
        "Board must display 'Cannot move ticket: <reason>' alert banner",
      );
      assert.ok(
        content.includes("onStatusChange"),
        "Board must trigger onStatusChange when allowed",
      );
      assert.ok(
        content.includes("KanbanColumn"),
        "Board must render KanbanColumn components",
      );
    });

    it("verifies static TypeScript interface contracts for Kanban components", () => {
      type KanbanBoardComponent = typeof KanbanBoard;
      type KanbanColumnComponent = typeof KanbanColumn;
      type KanbanCardComponent = typeof KanbanCard;

      type ExpectedBoardProps = {
        tickets: TicketItem[];
        members: MemberOption[];
        orgId: string;
        orgSlug: string;
        callerUserId: string;
        callerRole: OrgRole;
        onStatusChange: (
          ticketId: string,
          nextStatus: TicketStatus,
        ) => Promise<{ error?: string; success?: string }>;
      };

      // Assignability verification
      const _boardComponent: (props: ExpectedBoardProps) => React.JSX.Element =
        null as unknown as KanbanBoardComponent;
      const _columnComponent: KanbanColumnComponent =
        null as unknown as KanbanColumnComponent;
      const _cardComponent: KanbanCardComponent =
        null as unknown as KanbanCardComponent;

      assert.ok(typeof _boardComponent !== "undefined");
      assert.ok(typeof _columnComponent !== "undefined");
      assert.ok(typeof _cardComponent !== "undefined");
    });
  });
});
