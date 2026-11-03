# ADR 0005: Ticket Mutation RBAC and Activity Audit Log

## Status
Accepted

## Context
Following the implementation of ADR 0004 (Ticket Lifecycle Finite State Machine), security testing surfaced three critical operational and UI vulnerabilities:
1. **Unrestricted Ticket Property Mutation:** Any organization member could edit any ticket's title, description, priority, or assignee via `updateTicketAction`, even if they were not the author, not assigned, and held only a `member` role.
2. **Assignee Hijacking Privilege Escalation:** An unassigned bystander member could reassign another engineer's ticket to themselves, thereby becoming the "assignee" and gaining unauthorized authority to transition and resolve the ticket.
3. **Assigned Ticket State Preemption:** ADR 0004 allowed any member to transition a ticket from `open` to `in_progress`. While intended as an open-claim mechanism for unassigned work, this allowed bystander members to preempt and manipulate tickets already assigned to specific colleagues.
4. **React 19 Form State Desync:** Native HTML form submission in React 19 resets form controls to their default DOM values (the first `<option>`) on submit, temporarily displaying "Low" priority and "Unassigned" until a hard page reload.
5. **Absence of Accountability Trail:** There was no audit record of ticket mutations, making it impossible to determine who changed priority, re-assigned work, or transitioned statuses.

## Decision
We adopt strict ticket mutation RBAC, tighten state transitions on assigned tickets, and introduce an immutable activity audit log:

### 1. Ticket Mutation Authority (`canEditTicket` & `canReassignTicket`)
- **Full Edit Authority (`owner`, `admin`):** Workspace owners and administrators can edit any ticket's title, description, priority, and assignee.
- **Participating Member Authority (`created_by`, `assigned_to`):** The ticket author and current assignee can edit the title, description, and priority, and can reassign the ticket.
- **Bystander Member Restriction:** Standard members who are neither author nor assignee have **read-only access**. The UI displays read-only disabled inputs and hides the "Save Changes" button. The server action strictly rejects unauthorized edits with a 403 Forbidden error.

### 2. Tightened State Transition on Assigned Tickets
- An unassigned ticket in `open` status may still be started by any organization member (who is automatically or explicitly assigned).
- A ticket in `open` status that is **already assigned to another user** may only be transitioned to `in_progress` by that **Assignee**, an **Admin**, or an **Owner**. Bystanders are rejected.

### 3. Immutable Ticket Activity Log (`public.ticket_activities`)
- Add an append-only `public.ticket_activities` table recording every ticket lifecycle and property event:
  - Columns: `id`, `organization_id`, `ticket_id`, `actor_id`, `activity_type`, `old_value`, `new_value`, `metadata`, `created_at`.
  - Activity types: `created`, `status_changed`, `priority_changed`, `assignee_changed`, `details_updated`.
  - Security: Protected by PostgreSQL RLS. Workspace members can `SELECT`. Insert is restricted to authenticated members matching `organization_id`. `UPDATE` and `DELETE` are denied to preserve audit integrity.
  - Server Actions automatically record activity entries whenever tickets are created, updated, or transitioned.
  - Ticket Detail UI renders an activity timeline displaying the actor, event description, and timestamp.

### 4. Controlled Form State Synchronization
- Ticket detail component binds form values with `key={ticket.id + '-' + ticket.updated_at}` and controlled state to guarantee dropdowns remain faithfully synchronized with database state across server action revalidations.

## Consequences
- **Positive:** Closes the privilege escalation loophole preventing unauthorized members from hijacking or resolving colleagues' tickets.
- **Positive:** Provides complete enterprise audit visibility into all ticket modifications.
- **Positive:** Eliminates UI flicker/desynchronization after saving ticket changes.
- **Negative:** Reassigning work now requires involvement of the current assignee, author, or an admin, preventing bystander reassignment; this is the intended B2B operational constraint.
