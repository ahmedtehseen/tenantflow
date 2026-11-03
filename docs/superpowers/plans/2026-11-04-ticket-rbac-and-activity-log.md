# Ticket RBAC & Activity Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure ticket mutations by enforcing strict role-based edit & reassignment permissions, closing state machine loopholes on assigned tickets, eliminating React 19 form state desync, and implementing an immutable ticket activity audit log with a timeline UI.

**Architecture:** Pure RBAC and state validation rules in `src/lib/tickets/lifecycle.ts`, dual-verified server actions in `src/app/org/[slug]/tickets/actions.ts` recording atomic audit entries into a new PostgreSQL `public.ticket_activities` table, and a read-only guarded UI with an activity timeline in `src/app/org/[slug]/tickets/[ticketId]`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase PostgreSQL (RLS, Migrations), TypeScript, Tailwind CSS, Lucide icons, Node.js Test Runner.

**Spec:** [docs/adr/0005-ticket-rbac-and-activity-audit-log.md](file:///Users/digitaleap/Desktop/projects/AI-projects/tenantflow/docs/adr/0005-ticket-rbac-and-activity-audit-log.md)

## Global Constraints

- Always use Node 22 via `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"` for all npm, node, npx, and supabase commands.
- Preserve all existing unit tests in `tests/**/*.test.ts` (currently 56 passing).
- Comply with Next.js 16 conventions: dynamic hooks like `useSearchParams()` must be wrapped in `<Suspense>`.
- Maintain canonical domain terms from `GLOSSARY.md` (`Organization`, `Workspace`, `Tenant`).
- Production build command: `npx next build --webpack`.

## Review Focus

1. **Privilege Escalation:** Verify that a standard member (not author, not assignee) cannot edit title, description, priority, or assignee via API or UI.
2. **Assignee Preemption Defense:** Verify that an open ticket already assigned to Engineer A cannot be started (`open` &rarr; `in_progress`) by Engineer B unless Engineer B is an Admin or Owner.
3. **Form State Integrity:** Verify that saving a ticket in `ticket-detail.tsx` preserves selected priority and assignee without resetting to "Low" and "Unassigned".
4. **Audit Immutability:** Verify that `public.ticket_activities` RLS disallows client `UPDATE` and `DELETE` operations.
5. **Timeline Rendering:** Verify that activity timeline gracefully handles unassigned transitions, null actor profiles, and displays relative timestamps.

---

### Task 1: Tighten Ticket FSM & RBAC Logic in `lifecycle.ts`

**Files:**
- Modify: `src/lib/tickets/lifecycle.ts`
- Test: `tests/tickets/lifecycle.test.ts`

**Interfaces:**
- Consumes: `TicketLifecycleTarget`, `TicketActorContext`, `TicketStatus`, `OrgRole` from `src/lib/tickets/lifecycle.ts`.
- Produces:
  ```ts
  export function canEditTicket(ticket: TicketLifecycleTarget, actor: TicketActorContext): TransitionEvaluation;
  export function canReassignTicket(ticket: TicketLifecycleTarget, actor: TicketActorContext): TransitionEvaluation;
  export function canTransitionTicket(ticket: TicketLifecycleTarget, targetStatus: TicketStatus, actor: TicketActorContext): TransitionEvaluation;
  ```

- [ ] **Step 1: Write failing unit tests for `canEditTicket`, `canReassignTicket`, and tightened `canTransitionTicket`**

In `tests/tickets/lifecycle.test.ts`, add test suites:
- `canEditTicket`: allows owner, admin, author, assignee; rejects bystander member.
- `canReassignTicket`: allows owner, admin, author, assignee; rejects bystander member.
- `canTransitionTicket (assigned ticket guard)`: rejects `open` &rarr; `in_progress` by bystander member when `assigned_to` is already another user; allows when `assigned_to === actor.id` or `assigned_to === null` or actor is admin/owner.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: FAIL with `canEditTicket is not a function`.

- [ ] **Step 3: Implement `canEditTicket`, `canReassignTicket`, and update `canTransitionTicket` in `lifecycle.ts`**

1. Implement `canEditTicket`:
   ```ts
   export function canEditTicket(
     ticket: TicketLifecycleTarget,
     actor: TicketActorContext,
   ): TransitionEvaluation {
     const isOwner = actor.role === "owner";
     const isAdmin = actor.role === "admin";
     const isAuthor = ticket.created_by !== null && ticket.created_by === actor.id;
     const isAssignee = ticket.assigned_to !== null && ticket.assigned_to === actor.id;

     if (isOwner || isAdmin || isAuthor || isAssignee) {
       return { allowed: true };
     }
     return {
       allowed: false,
       reason: "You do not have permission to edit this ticket. Only the assignee, author, or workspace admins can make changes.",
     };
   }
   ```
2. Implement `canReassignTicket` (same logic as `canEditTicket`).
3. Update `open` &rarr; `in_progress` guard in `canTransitionTicket`:
   ```ts
   if (ticket.status === "open" && targetStatus === "in_progress") {
     if (ticket.assigned_to !== null && ticket.assigned_to !== actor.id && !isAdmin && !isOwner) {
       return {
         allowed: false,
         reason: "This ticket is assigned to another team member. Only the assignee, workspace admin, or owner can start work on it.",
       };
     }
     return { allowed: true };
   }
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS with all tests green.

- [ ] **Step 5: Commit changes**

Commit: `git add src/lib/tickets/lifecycle.ts tests/tickets/lifecycle.test.ts && git commit -m "feat(tickets): add edit and reassign RBAC guards and protect assigned ticket status"`

---

### Task 2: Database Migration for `public.ticket_activities` & Types

**Files:**
- Create: `supabase/migrations/03_ticket_activities.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces in `src/types/database.ts`:
  ```ts
  export type TicketActivityType =
    | "created"
    | "status_changed"
    | "priority_changed"
    | "assignee_changed"
    | "details_updated";

  export interface TicketActivity {
    id: string;
    organization_id: string;
    ticket_id: string;
    actor_id: string | null;
    activity_type: TicketActivityType;
    old_value: string | null;
    new_value: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }
  ```

- [ ] **Step 1: Create `supabase/migrations/03_ticket_activities.sql`**

Write SQL migration defining:
- `public.ticket_activities` table with `id`, `organization_id`, `ticket_id`, `actor_id`, `activity_type`, `old_value`, `new_value`, `metadata`, `created_at`.
- Foreign keys with `on delete cascade` for `organization_id` and `ticket_id`, `on delete set null` for `actor_id`.
- Indexes on `(ticket_id, created_at asc)` and `(organization_id)`.
- Enable RLS:
  - Policy `ticket_activities_select`: Organization members can select activities for tickets in their organization.
  - Policy `ticket_activities_insert`: Authenticated users can insert activities for their organization.
  - No `UPDATE` or `DELETE` policies (immutable append-only log).

- [ ] **Step 2: Update `src/types/database.ts`**

Export `TicketActivityType` and `TicketActivity` interfaces.

- [ ] **Step 3: Verify TypeScript builds**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit changes**

Commit: `git add supabase/migrations/03_ticket_activities.sql src/types/database.ts && git commit -m "feat(db): add ticket_activities schema and typescript types"`

---

### Task 3: Server Action RBAC Enforcement & Activity Recording

**Files:**
- Modify: `src/app/org/[slug]/tickets/actions.ts`
- Create: `tests/tickets/ticket-rbac-actions.test.ts`

**Interfaces:**
- Consumes: `canEditTicket`, `canReassignTicket`, `canTransitionTicket` from `src/lib/tickets/lifecycle.ts`.
- Modifies: `updateTicketAction`, `updateTicketStatusAction`, `createTicketAction` to insert activity logs into `ticket_activities`.

- [ ] **Step 1: Write unit tests for Server Action RBAC validation logic**

In `tests/tickets/ticket-rbac-actions.test.ts`, test that:
- Non-author, non-assignee standard member edit attempts return 403 error.
- Assignee change by unauthorized bystander is rejected.
- Permitted updates generate the expected activity audit payload records (`status_changed`, `priority_changed`, `assignee_changed`).

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: FAIL.

- [ ] **Step 3: Implement RBAC checks and activity logging in `actions.ts`**

1. In `updateTicketAction`:
   - Fetch existing ticket: `select("id, status, priority, title, description, created_by, assigned_to")`.
   - Call `canEditTicket(ticket, { id: user.id, role: context.currentRole })`. If not allowed, return `{ error: editEval.reason }`.
   - If `validation.data.assigned_to !== ticket.assigned_to`:
     - Call `canReassignTicket(ticket, { id: user.id, role: context.currentRole })`. If not allowed, return `{ error: reassignEval.reason }`.
   - If `validation.data.status !== ticket.status`:
     - Call `canTransitionTicket(...)`. If not allowed, return `{ error: transitionEval.reason }`.
   - Perform ticket `update`.
   - Batch insert into `ticket_activities`:
     - If status changed &rarr; insert `activity_type: "status_changed"`, `old_value: ticket.status`, `new_value: validation.data.status`.
     - If priority changed &rarr; insert `activity_type: "priority_changed"`, `old_value: ticket.priority`, `new_value: validation.data.priority`.
     - If assignee changed &rarr; insert `activity_type: "assignee_changed"`, `old_value: ticket.assigned_to`, `new_value: validation.data.assigned_to`.
     - If title or description changed &rarr; insert `activity_type: "details_updated"`.
2. In `createTicketAction`:
   - After ticket insertion, insert into `ticket_activities`:
     `activity_type: "created"`, `new_value: validation.data.status`, `metadata: { title: validation.data.title }`.
3. In `updateTicketStatusAction`:
   - Check `canTransitionTicket`.
   - Update ticket status and insert into `ticket_activities`: `activity_type: "status_changed"`, `old_value: currentStatus`, `new_value: newStatus`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm test`
Expected: PASS.

- [ ] **Step 5: Commit changes**

Commit: `git add src/app/org/[slug]/tickets/actions.ts tests/tickets/ticket-rbac-actions.test.ts && git commit -m "feat(tickets): enforce edit RBAC and record activity audit log in actions"`

---

### Task 4: Form State Desync Fix & Read-Only UI Guards in `ticket-detail.tsx`

**Files:**
- Modify: `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx`

**Interfaces:**
- Consumes: `canEditTicket` from `src/lib/tickets/lifecycle.ts`.

- [ ] **Step 1: Add controlled synchronization to form fields**

In `TicketDetail`:
- Compute `canEdit = canEditTicket(ticket, { id: callerUserId, role: callerRole }).allowed`.
- Add an effect to keep local state synced whenever server props update:
  ```tsx
  useEffect(() => {
    setTitle(ticket.title);
    setDescription(ticket.description || "");
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setAssignedTo(ticket.assigned_to || "");
  }, [ticket.title, ticket.description, ticket.status, ticket.priority, ticket.assigned_to, ticket.updated_at]);
  ```
- Also give the `<form>` a `key={ticket.updated_at}` so that when the server action completes and revalidates `updated_at`, React creates a clean form instance without native HTML form reset artifacts.

- [ ] **Step 2: Guard UI controls when `!canEdit`**

If `!canEdit`:
- Disable `title`, `description`, `priority`, and `assigned_to` fields (`disabled={!canEdit || isUpdatePending}`).
- In the `status` dropdown, disable all options other than the current status.
- Hide or disable the "Save Changes" button.
- Show an alert or badge at the top:
  `"Read-Only View: Only the assignee, author, or workspace admins can edit this ticket."`

- [ ] **Step 3: Run linter and tests**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm run lint && npm test`
Expected: 0 errors.

- [ ] **Step 4: Commit changes**

Commit: `git add src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx && git commit -m "fix(tickets): resolve form state desync and render read-only UI for unauthorized members"`

---

### Task 5: Activity Timeline UI Component & Page Integration

**Files:**
- Create: `src/app/org/[slug]/tickets/[ticketId]/_components/activity-timeline.tsx`
- Modify: `src/app/org/[slug]/tickets/[ticketId]/page.tsx`
- Modify: `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx`

**Interfaces:**
- `ActivityTimeline` accepts `activities: Array<TicketActivity & { actorProfile: { full_name: string | null; email: string } | null }>` and renders a clean vertical timeline.

- [ ] **Step 1: Create `activity-timeline.tsx`**

Build clean timeline component:
- Displays each event with an icon (`PlusCircle`, `GitCommit`, `ArrowRight`, `UserCheck`, `AlertCircle`).
- Human-readable text:
  - `created`: `"[Actor] created this ticket"`
  - `status_changed`: `"[Actor] changed status from [old] to [new]"`
  - `priority_changed`: `"[Actor] changed priority from [old] to [new]"`
  - `assignee_changed`: `"[Actor] assigned ticket to [new_assignee]"` (or `"unassigned ticket"`)
  - `details_updated`: `"[Actor] updated ticket details"`
- Formats timestamp using `new Date(activity.created_at).toLocaleString()`.

- [ ] **Step 2: Fetch activities in `src/app/org/[slug]/tickets/[ticketId]/page.tsx`**

In the server component `TicketDetailPage`:
- Query `supabase.from("ticket_activities").select("*, actor:profiles(id, full_name, email)").eq("ticket_id", ticketId).order("created_at", { ascending: false })`.
- Pass `activities` into `<TicketDetail ... activities={activities} />`.
- In `TicketDetail`, render `<ActivityTimeline activities={activities} />` beneath ticket properties or in a new "Activity & History" tab/section.

- [ ] **Step 3: Run linter and production build**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npm run lint && npx next build --webpack`
Expected: 0 errors.

- [ ] **Step 4: Commit changes**

Commit: `git add src/app/org/[slug]/tickets/[ticketId]/ && git commit -m "feat(tickets): add activity timeline component and integrate into ticket detail page"`

---

### Task 6: Database Push & End-to-End Verification

**Files:**
- Remote Supabase database (`owkqbuypklkoaiddmnbt`)
- GitHub remote repository (`origin/main`)

- [ ] **Step 1: Push database migration to remote Supabase**

Run: `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" npx supabase db push --remote --yes` (with `BypassSandbox: true`).
Verify table `public.ticket_activities` is created in remote Supabase.

- [ ] **Step 2: Run full verification suite**

1. Unit tests: `npm test` (all tests passing).
2. Linter: `npm run lint` (0 errors).
3. Production build: `npx next build --webpack` (all routes compiled cleanly).

- [ ] **Step 3: Push changes to GitHub `origin/main`**

Push commits to `origin main` to trigger Vercel production deployment.

- [ ] **Step 4: Update handoff documentation**

Update `docs/handoff.md` with the new RBAC rules, activity log schema, and completed verification steps.
