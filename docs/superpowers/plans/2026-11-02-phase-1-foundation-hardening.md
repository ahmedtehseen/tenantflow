# Phase 1: Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ADRs 0001–0004 to harden TenantFlow's multi-tenancy: zero-knowledge tenant enumeration defense, token-based invitation engine, dual verification in the data layer, and role-gated ticket lifecycle state machine.

**Architecture:** Database schema extensions with RLS policies (`is_public_directory` and `organization_invitations`), zero-knowledge 404 resolution in memoized tenant access, strict assertion helpers against confused-deputy mutations (`assertTenantScoping`), and a pure, testable ticket lifecycle state machine integrated into Server Actions and UI.

**Tech Stack:** Next.js 16 (App Router, React 19, Turbopack), TypeScript 5, Supabase (PostgreSQL, RLS, `@supabase/ssr`), Tailwind CSS v4, Node.js 22 (`node:test`, `node:assert`).

**Spec:**
- `docs/adr/0001-tenant-enumeration-defense.md`
- `docs/adr/0002-invitation-engine-for-member-onboarding.md`
- `docs/adr/0003-dual-verification-tenant-scoping.md`
- `docs/adr/0004-ticket-lifecycle-state-machine.md`
- `GLOSSARY.md`

---

## Global Constraints

- **Language & Domain Vocabulary:** Adhere strictly to `GLOSSARY.md`. Use `Organization` for the top-level customer boundary, `Workspace` for the member-facing operational UI (`/org/[slug]`), and `Tenant` for internal data isolation. Avoid "Company" or "Account".
- **Zero-Knowledge 404:** Non-member requests to `/org/[slug]` MUST call `notFound()` unless `is_public_directory === true`. Under no circumstances may an unauthenticated or unauthorized request learn whether a private organization slug exists.
- **Dual Verification Invariant:** Every mutating Server Action taking an `orgId` and `slug` must call `assertTenantScoping(context, orgId)` before executing any SQL mutation.
- **State Machine Integrity:** Ticket status transitions must pass through `canTransitionTicket`. Direct jumps (e.g., `open` -> `closed`) or unauthorized role transitions must be rejected with user-readable error messages.
- **No Direct Member Insertions:** Members can only join an organization by accepting a token-backed invitation in `public.organization_invitations`.
- **Framework Conventions:** Maintain Next.js 16 conventions: `src/proxy.ts` for auth proxying, dynamic route boundaries wrapped in `<Suspense>`, and React 19 `useActionState` patterns.

---

## Review Focus

1. **Confused Deputy Attack:** An authenticated user in Org A attempts to mutate a ticket in Org B by manipulating form inputs (`orgId`). Verify `assertTenantScoping` catches this and throws before touching the DB.
2. **Tenant Enumeration:** An unauthenticated or foreign user requests `/org/secret-private-slug`. Verify they receive a generic 404 and no organization metadata is leaked.
3. **Unauthorized Ticket Transition:** A standard member attempts to resolve a ticket assigned to someone else, or close a ticket they did not author. Verify `canTransitionTicket` blocks the action with a descriptive error.
4. **Reopening Closed Tickets:** A standard member attempts to reopen a closed ticket. Verify that only an Admin or Owner has authority to reopen.
5. **Invitation Token Reuse / Expiry:** A user attempts to accept an expired, revoked, or already-accepted invitation token. Verify the transaction fails cleanly without creating duplicate memberships.

---

## Task Decomposition

### Task 1: Database Migration & Schema Types

**Files:**
- Create: `supabase/migrations/02_foundation_hardening.sql`
- Modify: `src/types/database.ts`

**Steps:**
- [x] **Step 1:** Write the migration SQL file `supabase/migrations/02_foundation_hardening.sql`:
  - Add `is_public_directory boolean not null default false` column to `public.organizations`.
  - Create table `public.organization_invitations`:
    ```sql
    create table public.organization_invitations (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      email text not null,
      role text not null check (role in ('admin', 'member')),
      token text not null unique,
      invited_by uuid not null references public.profiles(id),
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '7 days'),
      accepted_at timestamptz,
      revoked_at timestamptz
    );
    ```
  - Create partial unique index to prevent duplicate active invitations for the same email per organization:
    ```sql
    create unique index idx_unique_active_invitation
      on public.organization_invitations(organization_id, lower(email))
      where accepted_at is null and revoked_at is null;
    ```
  - Enable RLS on `public.organization_invitations`.
  - Add RLS policies for `public.organization_invitations`:
    - `invitations_select_admin`: Organization owners/admins can view all invitations for their organization (`has_org_role(organization_id, array['owner', 'admin'])`).
    - `invitations_insert_admin`: Organization owners/admins can insert invitations.
    - `invitations_update_admin`: Organization owners/admins can update invitations (for revoking).
    - `invitations_select_recipient`: Authenticated users can view invitations sent to their email (`lower(email) = lower(auth.jwt() ->> 'email')`) or by token match.
  - Update `public.organizations` select RLS policy: allow public read of basic fields only if `is_public_directory = true`.
- [x] **Step 2:** Test migration syntax via Supabase CLI dry run:
  ```bash
  npx supabase db push --dry-run
  ```
- [x] **Step 3:** Update `src/types/database.ts` to include:
  - `is_public_directory` in `Organization` row and insert/update definitions.
  - Complete `OrganizationInvitation` interface and schema definitions (`id`, `organization_id`, `email`, `role`, `token`, `invited_by`, `created_at`, `expires_at`, `accepted_at`, `revoked_at`).
  - Invitation status helper type: `'pending' | 'accepted' | 'expired' | 'revoked'`.
- [x] **Step 4:** Run TypeScript build to confirm types compile cleanly:
  ```bash
  npm run build
  ```
- [x] **Step 5:** Commit migration and updated types:
  ```bash
  git add supabase/migrations/02_foundation_hardening.sql src/types/database.ts
  git commit -m "feat(db): add foundation hardening migration for public directory and invitations"
  ```

---

### Task 2: Ticket Lifecycle Pure FSM Module with Comprehensive Tests

**Files:**
- Create: `src/lib/tickets/lifecycle.ts`
- Create: `tests/tickets/lifecycle.test.ts`
- Modify: `package.json` (add `"test"` script)

**Steps:**
- [x] **Step 1:** Add `"test": "node --test --experimental-strip-types tests/**/*.test.ts"` to `package.json`.
- [x] **Step 2:** Write the failing test suite in `tests/tickets/lifecycle.test.ts` testing all transitions from ADR 0004:
  - Disallow unrecognized statuses or staying on the same status.
  - `open` -> `in_progress`: allowed for any member or assignee.
  - `open` -> `resolved` or `closed`: rejected (illegal direct jump).
  - `in_progress` -> `resolved`: allowed for assignee, admin, or owner; rejected for non-assignee standard member.
  - `in_progress` -> `open`: allowed for assignee, admin, or owner; rejected for non-assignee member.
  - `resolved` -> `closed`: allowed for ticket author, admin, or owner; rejected for non-author member even if assigned.
  - `resolved` -> `in_progress`: allowed for author, assignee, admin, or owner; rejected for unrelated member.
  - `closed` -> `open`: allowed only for admin or owner; rejected for standard member (even if ticket author).
- [x] **Step 3:** Run the test suite and verify it fails before implementation:
  ```bash
  npm test
  ```
- [x] **Step 4:** Implement `src/lib/tickets/lifecycle.ts`:
  - Define interfaces:
    ```typescript
    import type { TicketStatus, OrgRole } from "@/types/database";

    export interface TicketActorContext {
      id: string;
      name?: string;
      role: OrgRole;
    }

    export interface TicketLifecycleTarget {
      id: string;
      status: TicketStatus;
      created_by: string;
      assigned_to: string | null;
    }

    export interface TransitionEvaluation {
      allowed: boolean;
      reason?: string;
    }
    ```
  - Define `FSM_EDGES`:
    ```typescript
    export const FSM_EDGES: Record<TicketStatus, TicketStatus[]> = {
      open: ["in_progress"],
      in_progress: ["resolved", "open"],
      resolved: ["closed", "in_progress"],
      closed: ["open"],
    };
    ```
  - Implement `canTransitionTicket(ticket, targetStatus, actor): TransitionEvaluation`.
  - Implement helper `getAvailableNextStatuses(ticket, actor): TicketStatus[]`.
- [x] **Step 5:** Run tests and verify 100% pass:
  ```bash
  npm test
  ```
- [x] **Step 6:** Commit ticket lifecycle module:
  ```bash
  git add package.json src/lib/tickets/lifecycle.ts tests/tickets/lifecycle.test.ts
  git commit -m "feat(tickets): implement role-gated finite state machine validator with tests (ADR 0004)"
  ```

---

### Task 3: Data Layer Hardening — Zero-Knowledge 404 & Dual Verification

**Files:**
- Modify: `src/lib/data/tenant.ts`
- Create: `tests/data/tenant-scoping.test.ts`

**Steps:**
- [x] **Step 1:** Write unit tests in `tests/data/tenant-scoping.test.ts`:
  - `assertTenantScoping(context, targetOrgId)` passes when IDs match.
  - `assertTenantScoping(context, targetOrgId)` throws a typed `TenantScopingError` when IDs mismatch.
  - `resolveTenantAccess(isMember, isPublicDirectory)` returns `'allow'` for members, `'forbidden'` for public directory non-members, and `'not_found'` for private directory non-members.
- [x] **Step 2:** Run test suite and confirm failure:
  ```bash
  npm test
  ```
- [x] **Step 3:** Implement changes in `src/lib/data/tenant.ts`:
  - Define custom error class:
    ```typescript
    export class TenantScopingError extends Error {
      constructor(message = "Cross-tenant operation rejected: Tenant context mismatch.") {
        super(message);
        this.name = "TenantScopingError";
      }
    }
    ```
  - Implement `assertTenantScoping`:
    ```typescript
    export function assertTenantScoping(context: TenantContext, targetOrgId: string): void {
      if (!context.currentOrg || context.currentOrg.id !== targetOrgId) {
        throw new TenantScopingError(
          `Tenant scoping violation: Active context org (${context.currentOrg?.id}) does not match target org (${targetOrgId}).`
        );
      }
    }
    ```
  - Update `getTenantContext(slug)` to enforce ADR 0001 (Zero-knowledge enumeration defense):
    - When `activeOrg` is not in `userMemberships`, query `organizations` using `createAdminClient()`.
    - If organization does not exist: call `notFound()`.
    - If organization exists but `is_public_directory === false`: call `notFound()`.
    - If organization exists and `is_public_directory === true`: return context with `currentRole: null` (triggering 403 Access Denied view in layout).
- [x] **Step 4:** Run test suite and verify all pass:
  ```bash
  npm test
  ```
- [x] **Step 5:** Commit data layer hardening:
  ```bash
  git add src/lib/data/tenant.ts tests/data/tenant-scoping.test.ts
  git commit -m "feat(security): implement zero-knowledge 404 and dual verification helper (ADRs 0001, 0003)"
  ```

---

### Task 4: Ticket Server Actions Integration & FSM Enforcement

**Files:**
- Modify: `src/app/org/[slug]/tickets/actions.ts`
- Modify: `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx`

**Steps:**
- [x] **Step 1:** In `src/app/org/[slug]/tickets/actions.ts`:
  - Import `getTenantContext` and `assertTenantScoping` from `@/lib/data/tenant`.
  - Import `canTransitionTicket` from `@/lib/tickets/lifecycle`.
  - In `createTicketAction`:
    - Call `const context = await getTenantContext(orgSlug);`
    - Call `assertTenantScoping(context, orgId);`
  - In `updateTicketAction`:
    - Call `const context = await getTenantContext(orgSlug);`
    - Call `assertTenantScoping(context, orgId);`
    - If status is changing, fetch current ticket and validate transition via `canTransitionTicket`.
  - In `updateTicketStatusAction`:
    - Call `const context = await getTenantContext(orgSlug);`
    - Call `assertTenantScoping(context, orgId);`
    - Fetch current ticket details (`status`, `created_by`, `assigned_to`).
    - Run `const evaluation = canTransitionTicket(ticket, newStatus, { id: context.user.id, role: context.currentRole });`
    - If `!evaluation.allowed`, return `{ error: evaluation.reason }`.
    - If allowed, execute update and revalidate paths.
  - In `deleteTicketAction`:
    - Call `const context = await getTenantContext(orgSlug);`
    - Call `assertTenantScoping(context, orgId);`
- [x] **Step 2:** Update `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx`:
  - Use `getAvailableNextStatuses` from `@/lib/tickets/lifecycle` to only display status transitions that are legally permissible for the active user.
  - If a status cannot be selected, disable it with a hover tooltip or message explaining the role constraint (e.g., "Reopening closed tickets requires Workspace Admin or Owner").
- [x] **Step 3:** Run `npm run build` and `npm test` to ensure complete type and runtime validity:
  ```bash
  npm test && npm run build
  ```
- [x] **Step 4:** Commit ticket actions and UI integration:
  ```bash
  git add src/app/org/[slug]/tickets/actions.ts src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx
  git commit -m "feat(tickets): enforce dual verification and role-gated state transitions in actions and UI"
  ```

---

### Task 5: Token-Based Invitation Engine Backend

**Files:**
- Modify: `src/app/org/actions.ts`
- Create: `tests/invitations/invitation-actions.test.ts`

**Steps:**
- [x] **Step 1:** In `src/app/org/actions.ts`, implement token invitation logic:
  - `createInvitationAction(orgId: string, orgSlug: string, prevState: ActionState | null, formData: FormData)`:
    - Verify caller authentication and resolve `context = await getTenantContext(orgSlug)`.
    - Enforce `assertTenantScoping(context, orgId)`.
    - Enforce role check: caller must be `owner` or `admin`.
    - Validate recipient email format and target role (`admin` or `member`).
    - Check if the target email is already an active member in `organization_members`. If yes, return `"User is already a member of this organization."`
    - Check if an active invitation already exists for `(organization_id, lower(email))`.
    - Generate cryptographically secure URL-safe token using `crypto.randomBytes(32).toString('base64url')` (or `crypto.randomUUID()`).
    - Insert into `public.organization_invitations` with `expires_at = now() + interval '7 days'`.
    - Revalidate `/org/[slug]/members`.
  - `revokeInvitationAction(invitationId: string, orgId: string, orgSlug: string)`:
    - Verify caller is `owner` or `admin` in `context`.
    - Call `assertTenantScoping(context, orgId)`.
    - Update `public.organization_invitations` set `revoked_at = now()` where `id = invitationId`.
  - `acceptInvitationAction(token: string)`:
    - Verify user is authenticated.
    - Query `organization_invitations` by `token` where `accepted_at is null and revoked_at is null and expires_at > now()`.
    - If not found or expired, return `{ error: "Invalid, expired, or revoked invitation." }`.
    - Insert into `organization_members` with `(organization_id, user_id, role)`.
    - Update invitation with `accepted_at = now()`.
    - Return organization slug to redirect to the new workspace.
- [x] **Step 2:** Deprecate or remove the direct user enumeration query (`profiles.ilike("email", email)`) from `addMemberAction`.
- [x] **Step 3:** Run `npm test` and `npm run build` to verify clean compilation:
  ```bash
  npm test && npm run build
  ```
- [x] **Step 4:** Commit invitation backend actions:
  ```bash
  git add src/app/org/actions.ts
  git commit -m "feat(invitations): implement token-based invitation and acceptance actions (ADR 0002)"
  ```

---

### Task 6: Member Invitation & Acceptance UI

**Files:**
- Modify: `src/app/org/[slug]/members/page.tsx`
- Modify: `src/app/org/[slug]/members/_components/member-list.tsx`
- Create: `src/app/org/[slug]/members/_components/invite-member-modal.tsx`
- Create: `src/app/org/[slug]/members/_components/pending-invitations-list.tsx`
- Create: `src/app/invite/[token]/page.tsx`

**Steps:**
- [x] **Step 1:** Create `invite-member-modal.tsx` with Tailwind UI and accessible dialog:
  - Form fields: Email input and Role selector (`Member` or `Admin`).
  - Uses `useActionState` wired to `createInvitationAction`.
  - Copyable invitation link generation / preview.
- [x] **Step 2:** Create `pending-invitations-list.tsx`:
  - Displays pending invitations table: Email, Role badge, Created date, Expires date.
  - "Revoke" button triggering `revokeInvitationAction` with `<ConfirmModal />`.
- [x] **Step 3:** Update `src/app/org/[slug]/members/page.tsx`:
  - Fetch both active `organization_members` and pending `organization_invitations` in parallel (`Promise.all`).
  - Render active members section and pending invitations section.
  - Replace "Add Member" button with "Invite Member" modal trigger.
- [x] **Step 4:** Create invitation acceptance page `src/app/invite/[token]/page.tsx`:
  - Validates token on server component load.
  - If invalid or expired: renders clear error with link to home.
  - If valid: renders invitation card showing Organization Name, Inviter details, role offered, and "Join Workspace" button submitting to `acceptInvitationAction`.
  - If user is unauthenticated: displays sign-in / sign-up buttons with `next=/invite/[token]` redirect param.
- [x] **Step 5:** Run `npm run build` to verify routes and components compile without errors:
  ```bash
  npm run build
  ```
- [x] **Step 6:** Commit invitation UI components:
  ```bash
  git add src/app/org/[slug]/members/ src/app/invite/
  git commit -m "feat(invitations): add invite member modal, pending invitations list, and acceptance route"
  ```

---

### Task 7: End-to-End Build & Security Boundary Verification

**Files:**
- Verification only

**Steps:**
- [x] **Step 1:** Execute full unit test suite:
  ```bash
  npm test
  ```
  Verify all lifecycle, scoping, and invitation test suites pass.
- [x] **Step 2:** Execute full Next.js production build:
  ```bash
  npm run build
  ```
  Verify zero TypeScript or App Router layout errors.
- [x] **Step 3:** Push database migration to remote Supabase instance:
  ```bash
  npx supabase db push
  ```
- [x] **Step 4:** Manual smoke test scenarios:
  - Navigate to `/org/[non-existent-or-private-slug]`: verify zero-knowledge 404 renders.
  - Create ticket in workspace A and attempt to mutate status using workspace B org ID: verify rejection.
  - Test ticket transition as member: verify `open` -> `in_progress` succeeds, but non-assignee cannot `resolve`.
  - Issue invitation by email, copy invite link, accept from another session, and verify new member joins workspace.
- [x] **Step 5:** Update `docs/handoff.md` to reflect completion of Phase 1:
  ```bash
  git add docs/handoff.md
  git commit -m "docs: mark Phase 1 foundation hardening complete in handoff"
  ```

