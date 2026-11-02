# ADR 0004: Role-Gated Finite State Machine for Ticket Lifecycle

## Status
Accepted

## Context
Previously, `public.tickets` permitted tickets to transition between status values (`open`, `in_progress`, `resolved`, `closed`) freeform with no state machine enforcement or role checks. Any member of an organization could transition a ticket from any status to any other status (e.g., closing an open ticket without working on it, resolving tickets assigned to other developers, or reopening closed tickets without supervision).

Following architecture evaluation and logic prototyping (`ticket-lifecycle.prototype.html`), we explored:
- **Option 1 (Freeform):** Unrestricted status changes by any member.
- **Option 2 (Role-Gated FSM):** Enforcing explicit state transitions and role/relationship permissions.

## Decision
We adopt **Option 2: Role-Gated Finite State Machine** for all ticket status operations:

1. **State Machine Transitions:**
   - `open` &rarr; `in_progress`: Legal for any organization member or assignee.
   - `in_progress` &rarr; `resolved`: Restricted to ticket **Assignee**, **Admin**, or **Owner**.
   - `in_progress` &rarr; `open`: Restricted to ticket **Assignee**, **Admin**, or **Owner** (un-starting work).
   - `resolved` &rarr; `closed`: Restricted to ticket **Author** (`created_by`), **Admin**, or **Owner** (verification & sign-off).
   - `resolved` &rarr; `in_progress`: Restricted to **Author**, **Assignee**, **Admin**, or **Owner** (rejection of resolution).
   - `closed` &rarr; `open`: Restricted to **Admin** or **Owner** (reopening oversight to prevent zombie ticket churn).

2. **Validation Layer:**
   - Server Actions (`updateTicketStatusAction`, `updateTicketAction`) must validate transitions through the pure lifecycle validator (`canTransitionTicket`).
   - Any disallowed transition returns an explicit error message stating why the action was rejected.

## Consequences
- **Positive:** Guarantees accountability: assignees take ownership before resolving, authors verify before closing, and reopening requires administrative oversight.
- **Positive:** Prevents accidental shortcuts (such as jumping directly from `open` to `closed`).
- **Negative:** Reopening closed tickets requires admin intervention if an author is a standard member; mitigated by explicit administrative escalation paths.

