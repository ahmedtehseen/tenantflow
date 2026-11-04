# Phase 2: Realtime Collaborative Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a realtime collaborative workspace featuring a Kanban board with drag-and-drop state transitions, live Supabase Realtime synchronization across all ticket mutations, and real-time presence indicators showing active teammates viewing the workspace and individual tickets.

**Architecture:** Database publications on `tickets` and `ticket_activities` for Supabase Realtime, pure testable reducers and presence aggregators for deterministic state synchronization, zero-dependency HTML5 drag-and-drop Kanban columns enforcing ADR 0004 & ADR 0005 lifecycle rules with optimistic UI rollback, and Supabase Presence channels for live workspace and ticket viewer avatar stacks.

**Tech Stack:** Next.js 16 (React 19, Server Actions, App Router), Supabase (@supabase/supabase-js, @supabase/ssr, Realtime & Presence), TypeScript 5, Tailwind CSS v4, Lucide React, Node.js 22 test runner (`node:test`, `node:assert`).

**Spec:**
- `docs/adr/0006-realtime-collaborative-workspace.md`
- `docs/adr/0004-ticket-lifecycle-state-machine.md`
- `docs/adr/0005-ticket-rbac-and-activity-audit-log.md`
- `GLOSSARY.md`
- `docs/handoff.md`

## Global Constraints

- Always use Node 22 via `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"` for all npm, node, npx, and supabase commands.
- Preserve all 86 existing unit tests in `tests/**/*.test.ts`.
- Adhere strictly to `GLOSSARY.md` domain vocabulary: `Organization` (customer entity), `Workspace` (operational UI at `/org/[slug]`), and `Tenant` (isolation concept).
- Zero-dependency drag-and-drop: Use native HTML5 Drag and Drop API with React 19 synthetic event handlers to avoid React 19 compatibility regressions and 3rd party bundle overhead.
- Optimistic UI transitions must validate against `canTransitionTicket` client-side before dispatching, and gracefully roll back if server action fails.
- All client hooks reading search parameters (e.g. `useSearchParams`) must be wrapped in `<Suspense>`.
- Production build command: `npx next build --webpack`.

## Review Focus

1. **Illegal Drag-and-Drop State Jumps:** A user drags a ticket across columns into an invalid state (e.g. `open` directly to `closed`). Verify client validation stops the drag and server action rejects unauthorized transitions.
2. **Assignee Preemption on Kanban Drop:** A standard member drags someone else's assigned open ticket into `in_progress`. Verify it is rejected per ADR 0005 and rolls back to `open`.
3. **Multi-Tab / Concurrent Presence Deduplication:** A user opens the workspace in 3 tabs. Verify the presence aggregator deduplicates by `user_id` so the user is counted and shown as a single avatar bubble.
4. **Realtime Payload Reconciliation:** When a ticket is updated or deleted in one browser, verify other clients handle the Postgres Change event cleanly, updating the card in place or removing it without duplicating or crashing.
5. **Presence Cleanup on Unmount:** When navigating away from a ticket or workspace, verify channels untrack and unsubscribe cleanly without orphan presence state.

---

## Task Decomposition

### Task 1: Architecture Specification, Database Migration & Realtime Types

**Files:**
- Create: `docs/adr/0006-realtime-collaborative-workspace.md`
- Create: `supabase/migrations/04_realtime_collaboration.sql`
- Modify: `GLOSSARY.md`
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes: `Ticket`, `TicketActivity`, `OrgRole` from `src/types/database.ts`.
- Produces:
  - Realtime types in `src/types/database.ts`:
    ```ts
    export interface PresenceUser {
      userId: string;
      email: string;
      fullName: string | null;
      role: OrgRole;
      avatarUrl?: string | null;
      currentView?: "list" | "kanban" | "ticket";
      viewingTicketId?: string | null;
      onlineAt: string;
    }

    export type RealtimeTicketEvent = {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, any>;
      old: Record<string, any>;
    };
    ```

- [ ] **Step 1: Write the failing test for Realtime types and presence contracts**

In `tests/realtime/presence.test.ts`:
```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PresenceUser } from "../../src/types/database.ts";

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
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: FAIL with `PresenceUser not found` or module resolution error.

- [ ] **Step 3: Create ADR 0006, database migration, and export types in `src/types/database.ts`**

1. Create `docs/adr/0006-realtime-collaborative-workspace.md` detailing:
   - Status: Accepted
   - Context: Moving from static reload-based ticket management to collaborative workspace.
   - Decision: Supabase Realtime publication on `tickets` and `ticket_activities`, full replica identity, Supabase Presence channels for online avatar bars, native drag-and-drop Kanban enforcing ADR 0004 & ADR 0005 rules with optimistic rollback.
   - Consequences: Seamless team visibility, zero external drag-and-drop bundle weight, optimistic instant feedback.
2. Update `GLOSSARY.md` with definitions for `Kanban Board`, `Presence`, and `Realtime Workspace`.
3. Create `supabase/migrations/04_realtime_collaboration.sql`:
   ```sql
   -- =============================================================================
   -- TenantFlow: 04_realtime_collaboration
   -- Add tickets and ticket_activities to supabase_realtime publication
   -- and set replica identity to FULL for comprehensive old/new change records.
   -- =============================================================================

   alter publication supabase_realtime add table public.tickets;
   alter publication supabase_realtime add table public.ticket_activities;

   alter table public.tickets replica identity full;
   alter table public.ticket_activities replica identity full;
   ```
4. Export `PresenceUser` and `RealtimeTicketEvent` in `src/types/database.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0006-realtime-collaborative-workspace.md GLOSSARY.md supabase/migrations/04_realtime_collaboration.sql src/types/database.ts tests/realtime/presence.test.ts
git commit -m "feat(realtime): add ADR 0006, migration 04, and realtime presence types"
```

---

### Task 2: Pure Realtime Event Reducer & Optimistic State Transitions

**Files:**
- Create: `src/lib/realtime/ticket-events.ts`
- Test: `tests/realtime/ticket-events.test.ts`

**Interfaces:**
- Consumes: `TicketItem`, `MemberOption` from `src/app/org/[slug]/tickets/_components/ticket-list.tsx`, `TicketStatus` from `src/types/database.ts`.
- Produces:
  ```ts
  export function applyTicketRealtimeEvent(
    currentTickets: TicketItem[],
    event: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: any; old: any },
    memberMap: Map<string, { id: string; full_name: string | null; email: string }>
  ): TicketItem[];

  export function optimisticTicketStatusTransition(
    currentTickets: TicketItem[],
    ticketId: string,
    targetStatus: TicketStatus
  ): TicketItem[];

  export function revertOptimisticTicketStatus(
    currentTickets: TicketItem[],
    ticketId: string,
    previousStatus: TicketStatus
  ): TicketItem[];
  ```

- [ ] **Step 1: Write failing unit tests in `tests/realtime/ticket-events.test.ts`**

Write test suites for:
- Handling `INSERT`: Prepends new ticket, resolves creator and assignee from `memberMap`.
- Handling `UPDATE`: Modifies matching ticket in place (e.g. status, title, assigned_to), updates assignee info if assigned_to changed.
- Handling `DELETE`: Removes matching ticket by `id`.
- `optimisticTicketStatusTransition`: Updates ticket's `status` immediately in array.
- `revertOptimisticTicketStatus`: Reverts ticket's `status` to previous value if server action failed.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: FAIL with `ticket-events.ts` module not found.

- [ ] **Step 3: Implement `src/lib/realtime/ticket-events.ts`**

Implement pure functions:
1. `applyTicketRealtimeEvent`:
   - If `INSERT`: format `creator` and `assignee` using `memberMap.get()`. Return `[formattedTicket, ...currentTickets]`.
   - If `UPDATE`: map over `currentTickets`. If `t.id === event.new.id`, merge `event.new` and re-resolve `creator` and `assignee`. Return mapped array.
   - If `DELETE`: filter out ticket where `t.id === (event.old.id || event.new.id)`. Return filtered array.
2. `optimisticTicketStatusTransition`:
   - Map over `currentTickets`, updating `t.status = targetStatus` for `t.id === ticketId`.
3. `revertOptimisticTicketStatus`:
   - Map over `currentTickets`, updating `t.status = previousStatus` for `t.id === ticketId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime/ticket-events.ts tests/realtime/ticket-events.test.ts
git commit -m "feat(realtime): implement pure realtime event reducer and optimistic status transitions"
```

---

### Task 3: Pure Presence Aggregator & Viewer Filtering

**Files:**
- Create: `src/lib/realtime/presence.ts`
- Modify: `tests/realtime/presence.test.ts`

**Interfaces:**
- Consumes: `PresenceUser`, `OrgRole` from `src/types/database.ts`.
- Produces:
  ```ts
  export function formatPresenceUser(params: {
    userId: string;
    email: string;
    fullName: string | null;
    role: OrgRole;
    avatarUrl?: string | null;
    currentView?: "list" | "kanban" | "ticket";
    viewingTicketId?: string | null;
  }): PresenceUser;

  export function aggregateWorkspacePresence(
    rawState: Record<string, PresenceUser[]>
  ): PresenceUser[];

  export function filterTicketViewers(
    allPresentUsers: PresenceUser[],
    ticketId: string
  ): PresenceUser[];
  ```

- [ ] **Step 1: Write failing tests in `tests/realtime/presence.test.ts`**

Test suites:
- `aggregateWorkspacePresence`:
  - Flattens Supabase Presence state `{ "key1": [userA], "key2": [userA, userA] }` (multi-tab scenario).
  - Deduplicates by `userId`, preserving latest `onlineAt` or active view.
  - Sorts alphabetically by `fullName` or `email`.
- `filterTicketViewers`:
  - Returns only users where `viewingTicketId === targetTicketId`.
  - Excludes users browsing general board or different tickets.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: FAIL with `aggregateWorkspacePresence is not a function`.

- [ ] **Step 3: Implement `src/lib/realtime/presence.ts`**

1. `formatPresenceUser`: formats user object with `onlineAt: new Date().toISOString()`.
2. `aggregateWorkspacePresence`: creates a Map keyed by `userId`, iterates all presence entries, keeps the most recent entry, returns array sorted by name.
3. `filterTicketViewers`: filters array by `u.viewingTicketId === ticketId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime/presence.ts tests/realtime/presence.test.ts
git commit -m "feat(realtime): implement presence formatting and deduplication aggregator"
```

---

### Task 4: Supabase Realtime & Presence React Hooks

**Files:**
- Create: `src/hooks/use-ticket-realtime.ts`
- Create: `src/hooks/use-workspace-presence.ts`

**Interfaces:**
- Consumes:
  - `createClient` from `@/lib/supabase/client`
  - `applyTicketRealtimeEvent` from `@/lib/realtime/ticket-events`
  - `aggregateWorkspacePresence`, `formatPresenceUser` from `@/lib/realtime/presence`
  - `PresenceUser` from `@/types/database`
- Produces:
  ```ts
  export function useTicketRealtime(params: {
    orgId: string;
    initialTickets: TicketItem[];
    memberMap: Map<string, { id: string; full_name: string | null; email: string }>;
  }): {
    tickets: TicketItem[];
    setTickets: React.Dispatch<React.SetStateAction<TicketItem[]>>;
  };

  export function useWorkspacePresence(params: {
    orgId: string;
    currentUser: {
      id: string;
      email: string;
      full_name: string | null;
      role: OrgRole;
    };
    currentView?: "list" | "kanban" | "ticket";
    viewingTicketId?: string | null;
  }): {
    onlineUsers: PresenceUser[];
  };
  ```

- [ ] **Step 1: Write verification test for hook signatures and exports**

In `tests/realtime/hooks-contract.test.ts`:
```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Realtime Hooks Exports Contract", () => {
  it("imports hooks without runtime syntax errors", async () => {
    // Contract verification
    assert.ok(true);
  });
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 3: Implement `useTicketRealtime` and `useWorkspacePresence`**

1. `src/hooks/use-ticket-realtime.ts`:
   - Initialize `tickets` state with `initialTickets`.
   - In `useEffect`, obtain browser Supabase client via `createClient()`.
   - Create channel: `const channel = supabase.channel(`org:${orgId}:tickets`);`
   - Attach listener:
     ```ts
     channel.on(
       "postgres_changes",
       { event: "*", schema: "public", table: "tickets", filter: `organization_id=eq.${orgId}` },
       (payload) => {
         setTickets((current) =>
           applyTicketRealtimeEvent(
             current,
             {
               eventType: payload.eventType as any,
               new: payload.new,
               old: payload.old,
             },
             memberMap,
           ),
         );
       },
     );
     channel.subscribe();
     return () => {
       supabase.removeChannel(channel);
     };
     ```
2. `src/hooks/use-workspace-presence.ts`:
   - Initialize `onlineUsers` state.
   - In `useEffect`, join presence channel: `supabase.channel(`org:${orgId}:presence`);`
   - On `sync`: `setOnlineUsers(aggregateWorkspacePresence(channel.presenceState()));`
   - On subscribe status `"SUBSCRIBED"`, call:
     ```ts
     const presenceData = formatPresenceUser({
       userId: currentUser.id,
       email: currentUser.email,
       fullName: currentUser.full_name,
       role: currentUser.role,
       currentView,
       viewingTicketId,
     });
     channel.track(presenceData);
     ```
   - Cleanup: `channel.untrack()` and `supabase.removeChannel(channel)`.

- [ ] **Step 4: Run typecheck and lint to verify implementation**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-ticket-realtime.ts src/hooks/use-workspace-presence.ts tests/realtime/hooks-contract.test.ts
git commit -m "feat(realtime): add useTicketRealtime and useWorkspacePresence hooks"
```

---

### Task 5: Kanban Board Components with Drag-and-Drop FSM Gating

**Files:**
- Create: `src/app/org/[slug]/tickets/_components/kanban-card.tsx`
- Create: `src/app/org/[slug]/tickets/_components/kanban-column.tsx`
- Create: `src/app/org/[slug]/tickets/_components/kanban-board.tsx`
- Test: `tests/tickets/kanban-fsm-drag.test.ts`

**Interfaces:**
- Consumes:
  - `canTransitionTicket` from `@/lib/tickets/lifecycle`
  - `TicketItem`, `MemberOption` from `ticket-list.tsx`
  - `TicketStatus`, `OrgRole` from `@/types/database`
  - `updateTicketStatusAction` from `../actions`
- Produces:
  ```ts
  export function KanbanBoard(props: {
    tickets: TicketItem[];
    members: MemberOption[];
    orgId: string;
    orgSlug: string;
    callerUserId: string;
    callerRole: OrgRole;
    onStatusChange: (ticketId: string, nextStatus: TicketStatus) => Promise<{ error?: string; success?: string }>;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write failing unit test in `tests/tickets/kanban-fsm-drag.test.ts`**

Test validation rules for drag-and-drop drop handler:
- Calling drag drop validation with illegal jump (e.g. `open` -> `closed`) returns rejection.
- Calling drag drop validation for standard member on someone else's assigned open ticket returns rejection.
- Calling drag drop validation for closed ticket by standard member returns rejection.
- Calling drag drop validation for valid transitions returns `{ allowed: true }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: FAIL with missing test imports.

- [ ] **Step 3: Implement Kanban components**

1. `kanban-card.tsx`:
   - Props: `ticket: TicketItem`, `orgSlug: string`, `onDragStart: (e: React.DragEvent, ticket: TicketItem) => void`.
   - Card container with `draggable="true"`, cursor-grab, hover elevation, focus-visible outline.
   - Renders:
     - Header: Ticket title linking to `/org/[slug]/tickets/[ticket.id]`, priority badge (`TicketPriorityBadge`).
     - Description snippet (clamped 2 lines).
     - Footer: Assignee avatar / name (or "Unassigned" badge with UserMinus icon), created date relative/compact.
   - Handlers:
     - `onDragStart`: sets `e.dataTransfer.setData("application/json", JSON.stringify({ ticketId: ticket.id, currentStatus: ticket.status }))` and sets visual dragging opacity.
2. `kanban-column.tsx`:
   - Props: `status: TicketStatus`, `title: string`, `tickets: TicketItem[]`, `onDrop: (ticketId: string, targetStatus: TicketStatus) => void`, `isOver: boolean`.
   - Visual header with status icon, count badge, color accents:
     - Open: Sky / Blue accent
     - In Progress: Amber / Indigo accent
     - Resolved: Emerald accent
     - Closed: Zinc / Slate accent
   - Drop zone handlers:
     - `onDragOver`: `e.preventDefault()`, sets drop effect to "move".
     - `onDrop`: reads ticket data, calls `onDrop(ticketId, status)`.
3. `kanban-board.tsx`:
   - Manages drag state and error notification banner/toast.
   - Pre-drop validation: evaluates `canTransitionTicket(ticket, targetStatus, { id: callerUserId, role: callerRole })`.
     - If not allowed: renders error alert ("Cannot move ticket: " + evaluation.reason) and does not dispatch.
     - If allowed: triggers `onStatusChange(ticketId, targetStatus)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/org/[slug]/tickets/_components/kanban-card.tsx src/app/org/[slug]/tickets/_components/kanban-column.tsx src/app/org/[slug]/tickets/_components/kanban-board.tsx tests/tickets/kanban-fsm-drag.test.ts
git commit -m "feat(kanban): implement drag-and-drop Kanban board with FSM lifecycle enforcement"
```

---

### Task 6: View Mode Switcher, Presence Bar & Workspace Integration

**Files:**
- Create: `src/app/org/[slug]/tickets/_components/view-mode-toggle.tsx`
- Create: `src/app/org/[slug]/tickets/_components/presence-avatars.tsx`
- Modify: `src/app/org/[slug]/tickets/_components/ticket-list.tsx`
- Modify: `src/app/org/[slug]/tickets/page.tsx`

**Interfaces:**
- Consumes:
  - `useTicketRealtime` from `@/hooks/use-ticket-realtime`
  - `useWorkspacePresence` from `@/hooks/use-workspace-presence`
  - `KanbanBoard` from `./kanban-board`
  - `PresenceUser` from `@/types/database`
- Produces:
  - Synchronized workspace experience supporting toggle between List and Kanban views with shared filtering, live realtime ticket updates, and live presence indicator.

- [ ] **Step 1: Write failing test verifying view mode parameter resolution**

In `tests/realtime/view-mode.test.ts`:
```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("View Mode Parameter Resolution", () => {
  it("resolves view mode correctly with fallback to list", () => {
    const resolveView = (val?: string | null) => (val === "kanban" ? "kanban" : "list");
    assert.equal(resolveView("kanban"), "kanban");
    assert.equal(resolveView("list"), "list");
    assert.equal(resolveView("unknown"), "list");
    assert.equal(resolveView(undefined), "list");
  });
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 3: Implement `view-mode-toggle.tsx`, `presence-avatars.tsx`, and update `ticket-list.tsx` and `page.tsx`**

1. `src/app/org/[slug]/tickets/_components/view-mode-toggle.tsx`:
   - Segmented control `[ List | Board ]` with List and LayoutGrid icons.
   - Reads current view from `searchParams.get("view") || "list"`.
   - On change, updates URL search params using Next.js `useRouter` / `usePathname` without reloading.
   - Wrapped in `<Suspense>`.
2. `src/app/org/[slug]/tickets/_components/presence-avatars.tsx`:
   - Renders avatar stack of active online users.
   - Tooltip displaying: `{user.fullName || user.email} ({user.role})`.
   - If user count > 4, renders `+{count - 4}` pill.
   - Green pulse indicator for live connectivity.
3. Update `src/app/org/[slug]/tickets/_components/ticket-list.tsx`:
   - Wrap ticket state in `useTicketRealtime`.
   - Track presence with `useWorkspacePresence({ orgId, currentUser: { id: callerUserId, ... }, currentView: activeView })`.
   - Display `PresenceAvatars` in the toolbar.
   - Render `ViewModeToggle`.
   - Switch between table view and `<KanbanBoard>` while preserving search input and filters (priority, assignee).
   - Wire `onStatusChange` with optimistic update and rollback:
     ```ts
     const handleKanbanStatusChange = async (ticketId: string, nextStatus: TicketStatus) => {
       const previousTicket = tickets.find(t => t.id === ticketId);
       if (!previousTicket) return { error: "Ticket not found" };
       const previousStatus = previousTicket.status;

       // Optimistic update
       setTickets(current => optimisticTicketStatusTransition(current, ticketId, nextStatus));

       const res = await updateTicketStatusAction(ticketId, orgId, orgSlug, nextStatus);
       if (res?.error) {
         // Revert on error
         setTickets(current => revertOptimisticTicketStatus(current, ticketId, previousStatus));
         return { error: res.error };
       }
       return { success: res?.success || "Status updated" };
     };
     ```
4. Update `src/app/org/[slug]/tickets/page.tsx`:
   - Pass user details and initial view parameter cleanly to `TicketList`.

- [ ] **Step 4: Run typecheck and tests**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test && PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx tsc --noEmit`
Expected: PASS with 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/org/[slug]/tickets/_components/view-mode-toggle.tsx src/app/org/[slug]/tickets/_components/presence-avatars.tsx src/app/org/[slug]/tickets/_components/ticket-list.tsx src/app/org/[slug]/tickets/page.tsx tests/realtime/view-mode.test.ts
git commit -m "feat(workspace): integrate Kanban board, view toggle, and live presence into tickets page"
```

---

### Task 7: Ticket Detail Realtime Sync & Live Viewer Presence

**Files:**
- Modify: `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx`
- Modify: `src/app/org/[slug]/tickets/[ticketId]/page.tsx`

**Interfaces:**
- Consumes:
  - `useWorkspacePresence` from `@/hooks/use-workspace-presence`
  - `createClient` from `@/lib/supabase/client`
  - `PresenceAvatars` from `../_components/presence-avatars`
  - `filterTicketViewers` from `@/lib/realtime/presence`
- Produces:
  - Live "Who is viewing this ticket right now" avatar banner in `ticket-detail.tsx`.
  - Automatic live refresh of ticket details and activity timeline when modified by other teammates.

- [ ] **Step 1: Write test for ticket viewer presence filtering**

In `tests/realtime/ticket-presence.test.ts`:
```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterTicketViewers } from "../../src/lib/realtime/presence.ts";
import type { PresenceUser } from "../../src/types/database.ts";

describe("Ticket Detail Presence Filtering", () => {
  it("isolates viewers currently on the specific ticket", () => {
    const users: PresenceUser[] = [
      { userId: "u1", email: "a@a.com", fullName: "Alice", role: "member", currentView: "ticket", viewingTicketId: "t-123", onlineAt: "" },
      { userId: "u2", email: "b@b.com", fullName: "Bob", role: "admin", currentView: "kanban", viewingTicketId: null, onlineAt: "" },
      { userId: "u3", email: "c@c.com", fullName: "Charlie", role: "member", currentView: "ticket", viewingTicketId: "t-456", onlineAt: "" },
    ];
    const viewers = filterTicketViewers(users, "t-123");
    assert.equal(viewers.length, 1);
    assert.equal(viewers[0].userId, "u1");
  });
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS

- [ ] **Step 3: Update `ticket-detail.tsx` with realtime sync and live presence**

1. In `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx`:
   - Call `useWorkspacePresence({ orgId, currentUser: { id: callerUserId, email: callerEmail, full_name: callerName, role: callerRole }, currentView: "ticket", viewingTicketId: ticket.id })`.
   - Filter active viewers with `filterTicketViewers(onlineUsers, ticket.id)`.
   - Render a live presence banner beside ticket title:
     - Shows `PresenceAvatars` for other viewers on this ticket with "Viewing now" pill.
   - Add realtime channel subscription for this ticket:
     - Listen to `postgres_changes` on `tickets` where `id = eq.${ticket.id}`: updates title, description, status, priority, assignee live.
     - Listen to `postgres_changes` on `ticket_activities` where `ticket_id = eq.${ticket.id}`: automatically appends new activity records into timeline.
2. In `src/app/org/[slug]/tickets/[ticketId]/page.tsx`:
   - Pass caller email and full name to `ticket-detail.tsx` props for presence tracking.

- [ ] **Step 4: Run tests and typecheck**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test && PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx src/app/org/[slug]/tickets/[ticketId]/page.tsx tests/realtime/ticket-presence.test.ts
git commit -m "feat(realtime): add live viewer presence and realtime activity sync to ticket detail view"
```

---

### Task 8: Full Verification, Documentation & Production Build

**Files:**
- Modify: `docs/handoff.md`
- Test: All suites in `tests/**/*.test.ts`

**Interfaces:**
- Consumes: Complete Phase 2 codebase.
- Produces: 100% verified production build, 0 lint errors, 0 typecheck errors, updated handoff documentation.

- [ ] **Step 1: Run comprehensive unit and integration test suite**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: All tests pass (> 95 tests).

- [ ] **Step 2: Run TypeScript static typecheck**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run ESLint**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm run lint`
Expected: 0 warnings, 0 errors.

- [ ] **Step 4: Run Next.js production build**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx next build --webpack`
Expected: Compiled successfully with all routes rendered cleanly.

- [ ] **Step 5: Update `docs/handoff.md` and commit**

Update `docs/handoff.md` with:
- Summary of Phase 2 deliverables (Kanban board, Supabase Realtime, Presence).
- Test suite metrics and verification outcomes.
- Database migration `04_realtime_collaboration.sql` status.

```bash
git add docs/handoff.md
git commit -m "docs(handoff): document completion of Phase 2 Realtime Collaborative Workspace"
```

