# Phase 3: SLA Management, Automations & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and integrate enterprise-grade SLA management with business-hours deadline calculation, real-time ticket comments with teammate @mentions, an in-app notification center with live unread counts, outbound HMAC-signed webhooks with Upstash Redis persistent retry queueing, and a 30-minute scheduled background worker.

**Architecture:** Database extensions in Supabase (Migration 05) for SLA policies, ticket comments, in-app notifications, and webhook registries with RLS and Realtime publications; pure deterministic TypeScript calculation engines for business-hours SLAs and mention parsing; Upstash Redis REST client for persistent delayed retry jobs; Next.js 16 Server Actions and Route Handlers enforcing dual-verification tenant scoping ([ADR 0003](file:///Users/digitaleap/Desktop/projects/AI-projects/tenantflow/docs/adr/0003-dual-verification-tenant-scoping.md)).

**Tech Stack:** Next.js 16 (React 19, Server Actions, App Router, SSR Proxy), Supabase (@supabase/supabase-js, @supabase/ssr, Realtime), Upstash Redis (`@upstash/redis`), TypeScript 5, Tailwind CSS v4, Lucide React, Node.js 22 test runner (`node:test`, `node:assert`).

**Spec:**
- `docs/superpowers/specs/2026-11-10-phase-3-sla-automations-notifications-design.md`
- `docs/adr/0004-ticket-lifecycle-state-machine.md`
- `docs/adr/0005-ticket-rbac-and-activity-audit-log.md`
- `docs/adr/0006-realtime-collaborative-workspace.md`
- `GLOSSARY.md`

## Global Constraints

- Always use Node 22 via `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"` for all npm, node, npx, and supabase commands.
- Preserve all 144 existing unit tests in `tests/**/*.test.ts`.
- Adhere strictly to `GLOSSARY.md` domain vocabulary: `Organization` (customer entity), `Workspace` (operational UI at `/org/[slug]`), and `Tenant` (isolation concept).
- All new database tables must define strict Row Level Security (RLS) policies anchored to `get_auth_user_org_ids()` and verified through `assertTenantScoping(context, orgId)`.
- All client components reading search parameters (e.g. `useSearchParams`) must be wrapped in `<Suspense>`.
- Production build command: `npx next build --webpack`.
- Upstash Redis usage must adhere to free-tier boundaries (lightweight string payloads, 7-day TTL expiration, offline mock fallback for local tests).

## Review Focus

1. **Weekend / Overnight SLA Freezing:** A ticket is created on Friday at 4:30 PM with a 2-hour SLA. Verify that the deadline computes to Monday morning during business hours and the timer status remains `paused` over the weekend without falsely breaching.
2. **Assignee Preemption & Notification Privacy:** When a ticket status changes, verify that ONLY the ticket author and current assignee receive in-app notifications, and that the actor initiating the change is strictly excluded from receiving their own notification.
3. **Structured Mention Token Robustness:** A user enters `@[John Doe](a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11)` in a comment. Verify that the server extracts the valid UUID, queues a mention notification for that user, and does not require modifying `public.profiles`.
4. **Offline Redis Mocking in Test Suite:** In local test environments without `UPSTASH_REDIS_REST_URL`, verify that the Redis client gracefully falls back to an in-memory/stub queue so `npm test` runs 100% offline without network calls.
5. **Worker Execution Authentication:** Verify that `/api/cron/process-background-jobs` rejects requests lacking the correct `Authorization: Bearer ${CRON_SECRET}` header with a 401 Unauthorized status.

---

## Task Decomposition

### Task 1: Database Migration (05) & Schema Types

**Files:**
- Create: `supabase/migrations/05_phase_3_sla_notifications_webhooks.sql`
- Modify: `src/types/database.ts`
- Test: `tests/data/database-schema-phase3.test.ts`

**Interfaces:**
- Consumes: `public.organizations`, `public.tickets`, `public.profiles`
- Produces: `public.organization_sla_policies`, `public.ticket_comments`, `public.notifications`, `public.organization_webhooks`, `public.webhook_deliveries`, new ticket SLA columns, and database types for all 5 tables.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/data/database-schema-phase3.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Database Migration 05 Schema Verification', () => {
  it('defines organization_sla_policies with business hours and priority minutes', () => {
    const migration = readFileSync('supabase/migrations/05_phase_3_sla_notifications_webhooks.sql', 'utf8');
    assert.match(migration, /create table if not exists public\.organization_sla_policies/);
    assert.match(migration, /business_days integer\[\]/);
    assert.match(migration, /urgent_response_minutes/);
    assert.match(migration, /urgent_resolution_minutes/);
  });

  it('defines ticket_comments, notifications, and webhook tables with RLS enabled', () => {
    const migration = readFileSync('supabase/migrations/05_phase_3_sla_notifications_webhooks.sql', 'utf8');
    assert.match(migration, /create table if not exists public\.ticket_comments/);
    assert.match(migration, /create table if not exists public\.notifications/);
    assert.match(migration, /create table if not exists public\.organization_webhooks/);
    assert.match(migration, /create table if not exists public\.webhook_deliveries/);
    assert.match(migration, /alter table public\.ticket_comments enable row level security/);
    assert.match(migration, /alter table public\.notifications enable row level security/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/data/database-schema-phase3.test.ts`  
Expected: FAIL (file does not exist).

- [ ] **Step 3: Implement `supabase/migrations/05_phase_3_sla_notifications_webhooks.sql` and update `src/types/database.ts`**

Create Migration 05 containing:
1. `public.organization_sla_policies` with defaults (`UTC`, `{1,2,3,4,5}`, `09:00:00`, `17:00:00`, 60/240/480/1440 min targets) and RLS policy (`organization_sla_policies_member_access`).
2. Add SLA columns to `public.tickets`: `first_response_due_at`, `resolution_due_at`, `first_responded_at`, `first_response_breached`, `resolved_at`, `resolution_breached`.
3. `public.ticket_comments` with RLS (`member_select`, `member_insert`, `author_update`, `author_or_admin_delete`) and comment delete activity trigger.
4. `public.notifications` with RLS (`recipient_select`, `recipient_update`, `member_insert`).
5. `public.organization_webhooks` and `public.webhook_deliveries` with RLS.
6. Register `ticket_comments` and `notifications` in `supabase_realtime` publication.
7. Trigger `seed_organization_default_sla_policy()` on `public.organizations` after insert.
8. Export TypeScript interfaces in `src/types/database.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/data/database-schema-phase3.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/05_phase_3_sla_notifications_webhooks.sql src/types/database.ts tests/data/database-schema-phase3.test.ts
git commit -m "feat(db): add migration 05 for SLA policies, comments, notifications, and webhooks"
```

---

### Task 2: Pure SLA Business Hours Calculation Module

**Files:**
- Create: `src/lib/sla/business-hours.ts`
- Test: `tests/sla/business-hours.test.ts`

**Interfaces:**
- Produces:
  - `calculateBusinessDeadline(startTime: Date, targetMinutes: number, policy: SLAPolicyConfig): Date`
  - `calculateRemainingBusinessMinutes(now: Date, dueAt: Date, policy: SLAPolicyConfig): number`
  - `getSLAStatus(now: Date, dueAt: Date | null, completedAt: Date | null, isBusinessOpen: boolean): SLAStatus` (`'on_track' | 'at_risk' | 'breached' | 'met' | 'paused' | 'none'`)
  - `isBusinessOpen(date: Date, policy: SLAPolicyConfig): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sla/business-hours.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBusinessDeadline,
  calculateRemainingBusinessMinutes,
  getSLAStatus,
  isBusinessOpen,
} from '../../src/lib/sla/business-hours.ts';

describe('SLA Business Hours Engine', () => {
  const policy = {
    timezone: 'UTC',
    business_days: [1, 2, 3, 4, 5], // Mon-Fri
    business_start_time: '09:00:00',
    business_end_time: '17:00:00', // 8 hours = 480 mins/day
  };

  it('calculates deadline within the same business day', () => {
    const start = new Date('2026-11-09T10:00:00Z'); // Monday 10:00 AM UTC
    const deadline = calculateBusinessDeadline(start, 120, policy); // 2 hours
    assert.equal(deadline.toISOString(), '2026-11-09T12:00:00.000Z');
  });

  it('rolls deadline over to next day when target exceeds closing time', () => {
    const start = new Date('2026-11-09T16:00:00Z'); // Monday 4:00 PM (1 hr left today)
    const deadline = calculateBusinessDeadline(start, 120, policy); // 2 hours
    // 1 hr on Mon (until 5pm) + 1 hr on Tue (9am - 10am)
    assert.equal(deadline.toISOString(), '2026-11-10T10:00:00.000Z');
  });

  it('freezes deadline calculation over weekend (Friday afternoon to Monday morning)', () => {
    const start = new Date('2026-11-13T16:30:00Z'); // Friday 4:30 PM (30 mins left)
    const deadline = calculateBusinessDeadline(start, 120, policy); // 2 hours (30 min Fri + 90 min Mon)
    // 9:00 AM Monday + 90 mins = 10:30 AM Monday
    assert.equal(deadline.toISOString(), '2026-11-16T10:30:00.000Z');
  });

  it('starts clock at opening time if ticket is created overnight or on weekend', () => {
    const start = new Date('2026-11-15T12:00:00Z'); // Sunday noon
    const deadline = calculateBusinessDeadline(start, 60, policy); // 1 hour
    assert.equal(deadline.toISOString(), '2026-11-16T10:00:00.000Z');
  });

  it('evaluates SLA status correctly: met, breached, at_risk, paused, on_track', () => {
    const due = new Date('2026-11-09T12:00:00Z');
    // Completed on time
    assert.equal(getSLAStatus(new Date('2026-11-09T11:00:00Z'), due, new Date('2026-11-09T11:30:00Z'), true), 'met');
    // Overdue
    assert.equal(getSLAStatus(new Date('2026-11-09T13:00:00Z'), due, null, true), 'breached');
    // At risk (within 30 mins)
    assert.equal(getSLAStatus(new Date('2026-11-09T11:45:00Z'), due, null, true), 'at_risk');
    // Outside business hours
    assert.equal(getSLAStatus(new Date('2026-11-08T12:00:00Z'), due, null, false), 'paused');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/sla/business-hours.test.ts`  
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/sla/business-hours.ts`**

Implement business minutes calculation with minute-advancing or segment-skipping logic taking into account timezone offsets via date math.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/sla/business-hours.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sla/business-hours.ts tests/sla/business-hours.test.ts
git commit -m "feat(sla): implement deterministic business hours deadline calculator"
```

---

### Task 3: Ticket Lifecycle SLA Enforcement & Action Hooks

**Files:**
- Create: `src/lib/sla/ticket-sla.ts`
- Modify: `src/app/org/[slug]/tickets/actions.ts`
- Test: `tests/tickets/ticket-sla-actions.test.ts`

**Interfaces:**
- Consumes: `calculateBusinessDeadline`, `getSLAStatus` from Task 2, `assertTenantScoping` ([ADR 0003](file:///Users/digitaleap/Desktop/projects/AI-projects/tenantflow/docs/adr/0003-dual-verification-tenant-scoping.md))
- Produces: `computeTicketSLADeadlines(created_at, priority, policy)`, integrated `createTicketAction`, `updateTicketAction`, and `updateTicketStatusAction` managing SLA timestamps.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tickets/ticket-sla-actions.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTicketSLADeadlines, evaluateStatusTransitionSLA } from '../../src/lib/sla/ticket-sla.ts';

describe('Ticket Lifecycle SLA Integration', () => {
  const policy = {
    timezone: 'UTC',
    business_days: [1, 2, 3, 4, 5],
    business_start_time: '09:00:00',
    business_end_time: '17:00:00',
    urgent_response_minutes: 60,
    urgent_resolution_minutes: 240,
    high_response_minutes: 240,
    high_resolution_minutes: 1440,
    medium_response_minutes: 480,
    medium_resolution_minutes: 2880,
    low_response_minutes: 1440,
    low_resolution_minutes: 4320,
  };

  it('computes correct response and resolution due dates on ticket creation', () => {
    const created = new Date('2026-11-09T09:00:00Z');
    const deadlines = computeTicketSLADeadlines(created, 'urgent', policy);
    assert.equal(deadlines.first_response_due_at.toISOString(), '2026-11-09T10:00:00.000Z'); // 1 hr
    assert.equal(deadlines.resolution_due_at.toISOString(), '2026-11-09T13:00:00.000Z'); // 4 hrs
  });

  it('sets first_responded_at when moving from open to in_progress', () => {
    const transition = evaluateStatusTransitionSLA({
      fromStatus: 'open',
      toStatus: 'in_progress',
      firstResponseDueAt: new Date('2026-11-09T10:00:00Z'),
      firstRespondedAt: null,
      transitionTime: new Date('2026-11-09T09:30:00Z'),
    });
    assert.equal(transition.first_responded_at?.toISOString(), '2026-11-09T09:30:00.000Z');
    assert.equal(transition.first_response_breached, false);
  });

  it('marks first_response_breached true if moving to in_progress after due date', () => {
    const transition = evaluateStatusTransitionSLA({
      fromStatus: 'open',
      toStatus: 'in_progress',
      firstResponseDueAt: new Date('2026-11-09T10:00:00Z'),
      firstRespondedAt: null,
      transitionTime: new Date('2026-11-09T10:30:00Z'),
    });
    assert.equal(transition.first_response_breached, true);
  });

  it('clears resolved_at when a resolved ticket is reopened', () => {
    const transition = evaluateStatusTransitionSLA({
      fromStatus: 'resolved',
      toStatus: 'in_progress',
      resolutionDueAt: new Date('2026-11-09T17:00:00Z'),
      resolvedAt: new Date('2026-11-09T15:00:00Z'),
      transitionTime: new Date('2026-11-09T16:00:00Z'),
    });
    assert.equal(transition.resolved_at, null);
    assert.equal(transition.resolution_breached, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/tickets/ticket-sla-actions.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/sla/ticket-sla.ts` and modify `src/app/org/[slug]/tickets/actions.ts`**

Update `createTicketAction`, `updateTicketAction`, and `updateTicketStatusAction` to load the organization's SLA policy, compute/update SLA deadlines and breach states, and write corresponding entries to `public.ticket_activities`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/tickets/ticket-sla-actions.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sla/ticket-sla.ts src/app/org/[slug]/tickets/actions.ts tests/tickets/ticket-sla-actions.test.ts
git commit -m "feat(tickets): integrate SLA calculation and status transition milestone tracking"
```

---

### Task 4: Collaborative Ticket Comments & @Mention Autocompletion

**Files:**
- Create: `src/lib/comments/mention-utils.ts`
- Create: `src/app/org/[slug]/tickets/comments-actions.ts`
- Create: `src/app/org/[slug]/tickets/[ticketId]/_components/ticket-comments.tsx`
- Test: `tests/comments/comments.test.ts`

**Interfaces:**
- Consumes: `assertTenantScoping` ([ADR 0003](file:///Users/digitaleap/Desktop/projects/AI-projects/tenantflow/docs/adr/0003-dual-verification-tenant-scoping.md)), `public.ticket_comments`
- Produces: `extractMentionedUserIds(content: string): string[]`, `createCommentAction`, `updateCommentAction`, `deleteCommentAction`, `<TicketComments />` component.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/comments/comments.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMentionedUserIds, renderMentionTokens } from '../../src/lib/comments/mention-utils.ts';

describe('Mention Parsing & Formatting', () => {
  it('extracts unique valid UUIDs from structured @[Name](uuid) tokens', () => {
    const text = 'Hey @[Jane Doe](11111111-1111-1111-1111-111111111111), can you check with @[Bob](22222222-2222-2222-2222-222222222222) and @[Jane Doe](11111111-1111-1111-1111-111111111111)?';
    const ids = extractMentionedUserIds(text);
    assert.deepEqual(ids, [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('renders mention tokens as clean display text', () => {
    const text = 'Assigned to @[Alice Smith](33333333-3333-3333-3333-333333333333) for review.';
    const rendered = renderMentionTokens(text);
    assert.equal(rendered, 'Assigned to @Alice Smith for review.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/comments/comments.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/comments/mention-utils.ts`, `comments-actions.ts`, and `<TicketComments />`**

Implement Server Actions with dual verification, author edit/delete rules, admin moderation delete, and the client UI with live Supabase Realtime synchronization.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/comments/comments.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comments/mention-utils.ts src/app/org/[slug]/tickets/comments-actions.ts src/app/org/[slug]/tickets/[ticketId]/_components/ticket-comments.tsx tests/comments/comments.test.ts
git commit -m "feat(comments): add ticket discussion stream with structured mentions and Realtime sync"
```

---

### Task 5: In-App Notification Engine & Header Bell Component

**Files:**
- Create: `src/lib/notifications/notification-service.ts`
- Create: `src/app/org/[slug]/notifications/actions.ts`
- Create: `src/hooks/use-notifications-realtime.ts`
- Create: `src/app/org/[slug]/_components/notification-bell.tsx`
- Modify: `src/app/org/[slug]/_components/tenant-nav.tsx`
- Test: `tests/notifications/notifications.test.ts`

**Interfaces:**
- Consumes: `public.notifications`, Supabase Realtime
- Produces: `resolveNotificationRecipients(type, context)`, `markNotificationReadAction`, `markAllNotificationsReadAction`, `<NotificationBell />`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/notifications/notifications.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationRecipients } from '../../src/lib/notifications/notification-service.ts';

describe('Notification Recipient Targeting Rules', () => {
  it('targets author and assignee on status_changed, strictly excluding the actor', () => {
    const recipients = resolveNotificationRecipients({
      type: 'status_changed',
      actorId: 'user-author',
      authorId: 'user-author',
      assigneeId: 'user-assignee',
      adminUserIds: ['user-admin'],
    });
    // user-author is the actor, so only assignee gets it
    assert.deepEqual(recipients, ['user-assignee']);
  });

  it('targets admin/owners on SLA breach if ticket is unassigned', () => {
    const recipients = resolveNotificationRecipients({
      type: 'sla_breached',
      actorId: 'system',
      authorId: 'user-author',
      assigneeId: null,
      adminUserIds: ['admin-1', 'admin-2'],
    });
    assert.deepEqual(recipients, ['admin-1', 'admin-2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/notifications/notifications.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement `notification-service.ts`, actions, realtime hook, and `<NotificationBell />`**

Implement the notification targeting logic, Server Actions for marking read, and the dropdown notification tray mounted in `<TenantNav />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/notifications/notifications.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/notification-service.ts src/app/org/[slug]/notifications/actions.ts src/hooks/use-notifications-realtime.ts src/app/org/[slug]/_components/notification-bell.tsx src/app/org/[slug]/_components/tenant-nav.tsx tests/notifications/notifications.test.ts
git commit -m "feat(notifications): implement in-app notification center with Realtime unread counter"
```

---

### Task 6: Upstash Redis Client, Webhook Signatures & Persistent Retry Queue

**Files:**
- Modify: `package.json` (add `@upstash/redis`)
- Create: `src/lib/redis/client.ts`
- Create: `src/lib/webhooks/signer.ts`
- Create: `src/lib/webhooks/dispatcher.ts`
- Create: `src/app/org/[slug]/settings/webhooks/actions.ts`
- Test: `tests/webhooks/webhooks.test.ts`

**Interfaces:**
- Produces: `signWebhookPayload(payload, secret): string`, `enqueueWebhookEvent(eventType, payload, orgId)`, `dispatchWebhookDelivery(deliveryId)`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/webhooks/webhooks.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload, calculateRetryBackoffMs } from '../../src/lib/webhooks/signer.ts';

describe('Webhook Signatures & Retry Calculations', () => {
  it('generates valid HMAC-SHA256 signature header string', () => {
    const payload = JSON.stringify({ event: 'ticket.created', id: '123' });
    const secret = 'whsec_test_secret_123';
    const signature = signWebhookPayload(payload, secret);
    assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  });

  it('calculates exponential backoff intervals with expected caps', () => {
    assert.equal(calculateRetryBackoffMs(1), 60 * 1000); // 1 min
    assert.equal(calculateRetryBackoffMs(2), 5 * 60 * 1000); // 5 min
    assert.equal(calculateRetryBackoffMs(3), 15 * 60 * 1000); // 15 min
    assert.equal(calculateRetryBackoffMs(4), 60 * 60 * 1000); // 1 hour
    assert.equal(calculateRetryBackoffMs(5), 6 * 60 * 60 * 1000); // 6 hours
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/webhooks/webhooks.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Install `@upstash/redis` and implement client, signer, dispatcher, and actions**

Run `npm install @upstash/redis`. Implement HMAC signing, Upstash Redis client with offline memory fallback, and delivery dispatcher inserting into `public.webhook_deliveries` and scheduling retries in Redis sorted set `webhooks:retry_zset`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/webhooks/webhooks.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/redis/client.ts src/lib/webhooks/signer.ts src/lib/webhooks/dispatcher.ts src/app/org/[slug]/settings/webhooks/actions.ts tests/webhooks/webhooks.test.ts
git commit -m "feat(webhooks): add HMAC signature engine and Upstash Redis persistent retry queue"
```

---

### Task 7: Scheduled 30-Minute Background Worker Route

**Files:**
- Create: `src/app/api/cron/process-background-jobs/route.ts`
- Test: `tests/cron/background-worker.test.ts`

**Interfaces:**
- Consumes: `CRON_SECRET`, `SUPABASE_SECRET_KEY`, Upstash Redis `webhooks:retry_zset`
- Produces: `POST /api/cron/process-background-jobs` endpoint sweeping overdue tickets and ready webhook retries.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/cron/background-worker.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCronAuthorization } from '../../src/app/api/cron/process-background-jobs/route.ts';

describe('Background Worker Route Authorization', () => {
  it('accepts requests with matching Bearer token', () => {
    process.env.CRON_SECRET = 'valid-secret-key';
    assert.equal(verifyCronAuthorization('Bearer valid-secret-key'), true);
  });

  it('rejects unauthorized or missing tokens', () => {
    process.env.CRON_SECRET = 'valid-secret-key';
    assert.equal(verifyCronAuthorization(null), false);
    assert.equal(verifyCronAuthorization('Bearer wrong-key'), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/cron/background-worker.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement `/api/cron/process-background-jobs/route.ts`**

Implement route handler evaluating unattended SLA deadlines, marking breaches, queuing notifications, dispatching `sla.breached` events, and processing ready jobs from `webhooks:retry_zset`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH" && node --test tests/cron/background-worker.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/process-background-jobs/route.ts tests/cron/background-worker.test.ts
git commit -m "feat(cron): implement 30-minute background worker for SLA sweeps and webhook retries"
```

---

### Task 8: UI Integration & Verification Suite

**Files:**
- Modify: `src/app/org/[slug]/tickets/_components/kanban-card.tsx` (add SLA countdown badge)
- Modify: `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx` (embed `<TicketComments />` and SLA timer chip)
- Modify: `src/app/org/[slug]/settings/page.tsx` (add SLA Policy editor & Webhooks management tabs)
- Test: Full test suite (`npm test`)

**Interfaces:**
- Consumes: All Phase 3 components and services.
- Produces: Polished, unified operational UI.

- [ ] **Step 1: Write UI integration assertions in existing test suites**

Add test assertions verifying SLA chip rendering states on Kanban cards and comment section integration.

- [ ] **Step 2: Implement UI updates across Kanban cards, ticket details, and organization settings**

Render SLA status chips (Green/Amber/Red/Paused), mount comments on ticket details, and expose SLA policy & Webhook configuration in Organization Settings.

- [ ] **Step 3: Run full verification suite**

```bash
export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"
npm test
npx tsc --noEmit
npm run lint
npx next build --webpack
```
Expected:
- All unit & integration tests PASS.
- 0 TypeScript errors.
- 0 Lint errors.
- Next.js production build compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/app/org/[slug]/tickets/_components/kanban-card.tsx src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx src/app/org/[slug]/settings/page.tsx
git commit -m "feat(ui): integrate SLA countdown chips, ticket comments, and settings management"
```

