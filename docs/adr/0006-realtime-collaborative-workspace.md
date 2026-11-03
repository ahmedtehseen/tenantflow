# ADR 0006: Realtime Collaborative Workspace & Interactive Kanban Board

## Status
Accepted

## Context
In Phase 1, TenantFlow established core multi-tenancy isolation (ADR 0001, ADR 0003), token-based invitation flows (ADR 0002), a finite state machine for ticket lifecycles (ADR 0004), and strict mutation RBAC with an append-only activity audit log (ADR 0005).

However, the user interface was strictly synchronous and request-driven:
1. **Stale Multi-User State:** When multiple engineers collaborate in the same workspace, status changes, assignments, and newly filed tickets require manual page reloads to become visible, risking collision or duplicate work.
2. **Absence of Teammate Presence:** Teammates have no awareness of who is currently active in the workspace or reviewing a specific ticket.
3. **Rigid List-Based Workflow:** Status transitions require opening ticket details or selecting dropdown menus rather than intuitive visual progression through a Kanban board.
4. **Third-Party Drag-and-Drop Fragility:** Many popular drag-and-drop packages (such as `react-beautiful-dnd`) suffer from React 19 incompatibility, heavy bundle sizes, or hydration mismatches in Next.js App Router applications.

## Decision
We implement a zero-external-dependency, realtime collaborative workspace combining Supabase Realtime Postgres Changes, Supabase Presence channels, and a native HTML5 Drag-and-Drop Kanban board:

### 1. Supabase Realtime Publications & Replica Identity
We configure PostgreSQL to broadcast database mutations over Supabase Realtime:
- **Publication Registration:** Register `public.tickets` and `public.ticket_activities` in the `supabase_realtime` publication.
- **Full Replica Identity:** Set `replica identity full` on both `public.tickets` and `public.ticket_activities`. This ensures that `UPDATE` and `DELETE` payloads contain the complete prior row (`old`), enabling accurate client-side reconciliation and optimistic state recovery.
- **Tenant Isolation on Clients:** While Supabase Realtime broadcasts table events, clients subscribe using tenant-scoped channel filters (`realtime:org:${organizationId}`) and verify that incoming payloads match the active organization boundary before reducing into state.

### 2. Live Presence Tracking & Aggregation
We use Supabase Realtime Presence channels (`presence:org:${slug}` and `presence:ticket:${ticketId}`) for live awareness:
- **Presence State Contract (`PresenceUser`):**
  - `userId`: Unique user profile identifier (`UUID`).
  - `email`: Authenticated member's email.
  - `fullName`: Display name or null.
  - `role`: Member's organization role (`owner`, `admin`, `member`).
  - `avatarUrl`: Optional profile avatar URI.
  - `currentView`: Active view mode (`list`, `kanban`, `ticket`).
  - `viewingTicketId`: Specific ticket being inspected (when in detail view).
  - `onlineAt`: ISO 8601 timestamp of joining the channel.
- **Deduplication:** Multiple concurrent tabs or sessions belonging to the same user are deduplicated by `userId` in the presence aggregation layer, presenting a clean avatar stack.
- **Lifecycle Cleanup:** Subscriptions register unmount cleanup routines to untrack and leave channels immediately when navigating away, preventing ghost presence bubbles.

### 3. Native Zero-Dependency Drag-and-Drop Kanban Board
We build a native Kanban board using standard HTML5 Drag and Drop events (`draggable`, `onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`):
- **Zero Bundle Overhead:** Avoids heavy third-party drag-and-drop libraries, guaranteeing seamless compatibility with React 19 and Next.js App Router.
- **Lifecycle & RBAC Enforcement:** Dragging a ticket card between status columns evaluates ADR 0004 state machine rules (`canTransitionTicket`) and ADR 0005 assignee preemption rules on the client before accepting the drop.
- **Optimistic UI with Rollback:** On drop, the UI immediately moves the ticket card to the target column. If the underlying server action (`updateTicketStatusAction`) fails or is rejected, the client rolls back state to the previous snapshot and displays an inline toast notification.

### 4. Deterministic Realtime Reducers
Ticket and activity updates arriving via WebSocket are processed through pure, deterministic reducer functions (`reduceTicketRealtimeEvent`, `reduceActivityRealtimeEvent`):
- **INSERT:** Appends the new item to the active state if belonging to the current organization.
- **UPDATE:** Replaces the existing record by ID or adds it if previously unseen.
- **DELETE:** Removes the record from local state collections.

## Consequences
- **Positive:** Delivers instantaneous multi-user collaboration without requiring page refreshes.
- **Positive:** Team members can see who is online and inspecting tickets in real time.
- **Positive:** Zero third-party drag-and-drop bundle footprint eliminates React 19 compatibility hazards.
- **Positive:** Optimistic transitions provide responsive UI feedback with safety against network or permission failures.
- **Negative / Considerations:** Realtime WebSocket connections consume client connections; client channels must handle network reconnections and reconcile state against server-rendered data.
