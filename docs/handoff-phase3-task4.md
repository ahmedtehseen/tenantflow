# Phase 3 Handoff

## Continuation completed on November 13, 2026

Tasks 4 through 8 are implemented on `feat/phase-3-sla-automations`.

- Live Markdown discussions support structured teammate mentions, author editing, author/admin deletion, and deletion audit entries.
- The header notification bell streams recipient-scoped notifications and supports marking individual or all notifications read.
- Database triggers save notifications and webhook delivery jobs atomically with ticket/comment changes. Recipient targeting and member validation live in the database migration.
- Signed HTTPS webhooks support endpoint creation, editing, enabling/disabling, deletion, delivery history, and manual retry. Dispatch reserves attempts using database leases. Supabase stores the durable outbox, and Upstash Redis stores the delayed retry queue with an offline memory fallback.
- The authenticated background route processes SLA breaches, deduplicated risk warnings, and Redis-ready webhook retries, with Supabase recovery for eligible jobs. `vercel.json` schedules the route every 30 minutes using Vercel Schedules.
- SLA countdown chips appear on Kanban cards and ticket details. Organization settings expose SLA policy and webhook sections. Policy changes apply to new tickets and subsequent priority changes. Target inputs accept 1–525,600 business minutes.
- General ticket editing now applies SLA milestones as well as quick status changes. Both mutation paths reject concurrent stale writes.
- Realtime subscriptions await browser authentication before joining. Comment mutations refresh the discussion without revalidating the parent ticket form.
- Tailwind uses the standard PostCSS plugin across development and Webpack production builds. The workspace header adapts to mobile widths with the notification bell.

### Database

Migrations `05_phase_3_sla_notifications_webhooks.sql` and `20261112220208_phase3_event_pipeline.sql` are applied to linked Supabase project `owkqbuypklkoaiddmnbt`. The latter adds tenant-safe comment identity, notification write protection, transactional events, service-only worker functions, and delivery claims.

### Verification

- 232 tests pass, including actual PostgreSQL migration, trigger, RLS, targeting, deduplication, and claim tests through PGlite.
- Type checking and lint pass. The Webpack production build compiles all 16 routes and emits Tailwind utilities.
- Two-user browser checks cover live discussion, mentions, notifications, read state, author editing, deletion/audit, general edit SLA milestones, policy settings, webhook CRUD, member permissions, and responsive layout. Temporary verification users and their organization are removed after each run.
- The production worker route returns 401 for missing/incorrect bearer tokens and 200 for a valid token. A reserved `.invalid` endpoint verifies persisted delivery failure, future retry eligibility, the five-attempt limit, and administrator manual retry through settings.
- Hosted database advisors report existing public helper/trigger-function execution warnings and disabled leaked-password protection. New worker RPCs are restricted to the service role.

### Production activation

Follow [the scheduler setup guide](scheduler-setup.md) for secret configuration, deployment, a manual test, and troubleshooting.

Deploy the updated application and configure `CRON_SECRET` in the production environment to activate the scheduled worker. Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the planned production Redis retry queue. Pending deliveries remain durable in Supabase when Redis is absent or unavailable.

### November 13 Redis correction

The initial continuation treated Redis as an optional index and read Redis-ready IDs only during cleanup. The corrected worker dispatches Redis-ready IDs, deduplicates them against Supabase recovery candidates, and keeps database delivery claims for concurrency safety. A regression test exercises Redis dispatch, duplicate IDs, Redis outage recovery, and organization-scoped immediate dispatch. The scheduler guide now includes Upstash database setup as a production step.

The November 10 checkpoint and original implementation notes follow.

---

**Date:** 2026-11-10  
**Branch:** `feat/phase-3-sla-automations`  
**Plan:** `docs/superpowers/plans/2026-11-10-phase-3-sla-automations-notifications.md`  
**Design Spec:** `docs/superpowers/specs/2026-11-10-phase-3-sla-automations-notifications-design.md`  
**Ledger:** `.superpowers/sdd/2026-11-10-phase-3-sla-automations-notifications/progress.md`

---

## Progress Summary

| Task | Status | Commit(s) |
|------|--------|-----------|
| Task 1: Database Migration (05) & Schema Types | ✅ Done | `ce4e954`, `fa9650d` |
| Task 2: Pure SLA Business Hours Calculation Module | ✅ Done | `8c9d44b` |
| Task 3: Ticket Lifecycle SLA Enforcement & Action Hooks | ✅ Done | `cf0be7e` |
| Task 4: Collaborative Ticket Comments & @Mention Autocompletion | ✅ Done | `92a7f77` |
| Task 5: In-App Notification Engine & Header Bell Component | ✅ Done | `92a7f77` |
| Task 6: Upstash Redis Client, Webhook Signatures & Persistent Retry Queue | ✅ Done | `ad9bd12`, `084b328` |
| Task 7: Scheduled 30-Minute Background Worker Route | ✅ Done | `ad9bd12` |
| Task 8: UI Integration & Verification Suite | ✅ Done | `92a7f77`, `084b328` |

**November 10 checkpoint test count: 202/202 passing. See current verification above.**

---

## What Has Been Built

### Task 1 — Database Migration 05
Migration file: `supabase/migrations/05_phase_3_sla_notifications_webhooks.sql`

**Created Tables:**
- `public.organization_sla_policies` — SLA targets per priority (urgent/high/medium/low), business hours window, timezone, business days. Auto-seeded via trigger on organization insert.
- `public.ticket_comments` — Markdown comments with `is_edited` flag and `edited_at` timestamp. RLS: members can read/write own comments; admins can delete any.
- `public.notifications` — In-app alerts with `type` (ticket_assigned, mention, status_changed, sla_breached, sla_at_risk), `read_at` column, and RLS restricting to recipient.
- `public.organization_webhooks` — Webhook endpoints with HMAC `secret`, event subscriptions array, and active flag.
- `public.webhook_deliveries` — Delivery outbox with `attempts`, `status`, `next_retry_at`, exponential backoff tracking.

**Modified:** `public.tickets` now has: `first_response_due_at`, `resolution_due_at`, `first_responded_at`, `first_response_breached`, `resolved_at`, `resolution_breached`.

**Realtime:** `ticket_comments` and `notifications` enrolled in `supabase_realtime` publication.  
**TypeScript types:** All new tables in `src/types/database.ts` including `SLAStatus`, `NotificationType`, `WebhookDeliveryStatus`.

### Task 2 — Business Hours SLA Engine
File: `src/lib/sla/business-hours.ts`  
Subpath alias: `#sla/business-hours`

**Exports:**
- `calculateBusinessDeadline(startTime, targetMinutes, policy): Date`
- `calculateRemainingBusinessMinutes(now, dueAt, policy): number`
- `getSLAStatus(now, dueAt, completedAt, isBusinessOpen): SLAStatus`
- `isBusinessOpen(date, policy): boolean`
- `getNearestBusinessOpenTime(date, policy): Date`

Handles IANA timezones, same-day, cross-day rollover, weekend/overnight freeze, custom workweeks.

### Task 3 — Ticket Lifecycle SLA Enforcement
File: `src/lib/sla/ticket-sla.ts`  
Subpath alias: `#sla/ticket-sla` (registered in `package.json`)

**Exports:**
- `computeTicketSLADeadlines(createdAt, priority, policy): SLADeadlines`
- `evaluateStatusTransitionSLA(input): StatusTransitionSLAResult`
- `getTargetMinutesForPriority(priority, policy): { responseMinutes, resolutionMinutes }`

**Modified:** `src/app/org/[slug]/tickets/actions.ts`
- `createTicketAction`: loads org SLA policy, computes and persists `first_response_due_at` and `resolution_due_at`.
- `updateTicketStatusAction`: evaluates SLA milestones on transitions (open→in_progress sets `first_responded_at`, in_progress→resolved sets `resolved_at`, reopening clears `resolved_at`).
- `updateTicketAction`: recalculates SLA deadlines from original `created_at` when priority changes.

---

## Original continuation instructions from November 10

### Task 4: Collaborative Ticket Comments & @Mention Autocompletion

**Files to Create:**
- `src/lib/comments/mention-utils.ts` — Mention parsing (`@[Name](uuid)` tokens)
- `src/app/org/[slug]/tickets/comments-actions.ts` — `createCommentAction`, `updateCommentAction`, `deleteCommentAction`
- `src/app/org/[slug]/tickets/[ticketId]/_components/ticket-comments.tsx` — Live discussion UI
- `tests/comments/comments.test.ts` — Mention utils unit tests

**Subpath alias to add** in `package.json` imports:
```json
"#comments/mention-utils": "./src/lib/comments/mention-utils.ts"
```

**Key Requirement: Mention token format:**  
`@[Full Name](profile-uuid)` — client inserts this format, server parses via regex `/@\[(.*?)\]\(([a-f0-9-]+)\)/g`.

**Comment permissions (enforced by Server Actions + RLS):**
- Any member: SELECT, INSERT
- Author: UPDATE (edit own comment), DELETE (delete own comment)
- Admin/Owner: DELETE any comment
- Deletion logs `comment_deleted` activity to `ticket_activities`.
- Mention detection: extract UUIDs from token, queue in-app `notification` rows for each mentioned member (excluding the author from their own mention).

**Live sync:** Use Supabase Realtime subscription on `ticket_comments` channel `comments:ticket:${ticketId}`.

---

### Task 5: In-App Notification Engine & Header Bell Component

**Files to Create:**
- `src/lib/notifications/notification-service.ts` — Recipient resolution logic
- `src/app/org/[slug]/notifications/actions.ts` — `markNotificationReadAction`, `markAllNotificationsReadAction`
- `src/hooks/use-notifications-realtime.ts` — Realtime hook for `notifications:user:${userId}` channel
- `src/app/org/[slug]/_components/notification-bell.tsx` — Bell icon, unread badge, dropdown
- Modify: `src/app/org/[slug]/_components/tenant-nav.tsx` — Mount `<NotificationBell />`
- `tests/notifications/notifications.test.ts` — Recipient targeting logic tests

**Recipient targeting matrix:**
```typescript
function resolveNotificationRecipients({ type, actorId, authorId, assigneeId, adminUserIds }):
  string[]
```
- `ticket_assigned` → `[assigneeId]` (if assignee != actor)
- `mention` → mentioned UUIDs from comment (excluding actor)
- `status_changed` → `[authorId, assigneeId]` minus actor
- `sla_breached` / `sla_at_risk` → `[assigneeId]` if assigned, else `adminUserIds`

---

### Task 6: Upstash Redis Client, Webhook Signatures & Persistent Retry Queue

**Setup:**
- Run `npm install @upstash/redis`
- Add env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.example`

**Files to Create:**
- `src/lib/redis/client.ts` — Upstash REST client with offline in-memory stub fallback
- `src/lib/webhooks/signer.ts` — `signWebhookPayload(payload, secret): string` (HMAC-SHA256), `calculateRetryBackoffMs(attempt): number`
- `src/lib/webhooks/dispatcher.ts` — `enqueueWebhookEvent(eventType, payload, orgId)`, `dispatchWebhookDelivery(deliveryId)`
- `src/app/org/[slug]/settings/webhooks/actions.ts` — CRUD Server Actions for webhook registration
- `tests/webhooks/webhooks.test.ts` — Signature + backoff tests

**Backoff schedule (fixed):** attempt 1 = 60s, 2 = 300s, 3 = 900s, 4 = 3600s, 5 = 21600s  
**Redis sorted set key:** `webhooks:retry_zset` (score = `Date.now() + backoffMs`)  
**Outbound header:** `X-TenantFlow-Signature: sha256=<hmac>`

---

### Task 7: Scheduled 30-Minute Background Worker Route

**File to Create:**
- `src/app/api/cron/process-background-jobs/route.ts`
- `tests/cron/background-worker.test.ts`

**Env var:** `CRON_SECRET` — added to `.env.example`  
**Auth:** `Authorization: Bearer ${CRON_SECRET}` header verification via exported `verifyCronAuthorization(header: string | null): boolean`

**Worker tasks:**
1. **SLA Breach Sweep:** Supabase admin client scans tickets where `first_response_due_at < now() AND first_responded_at IS NULL AND first_response_breached = false` → set `first_response_breached = true`, log `sla_breached` activity, insert `sla_breached` notification for assignee/admins, enqueue `sla.breached` webhook event.
2. **Resolution Breach Sweep:** Same pattern for `resolution_due_at < now() AND resolved_at IS NULL AND resolution_breached = false`.
3. **Webhook Retry Sweep:** Read `ZRANGEBYSCORE webhooks:retry_zset 0 <now>`, call `dispatchWebhookDelivery(deliveryId)` for each, remove from set.

---

### Task 8: UI Integration & Verification Suite

**Files to Modify:**
- `src/app/org/[slug]/tickets/_components/kanban-card.tsx` — SLA countdown chip
- `src/app/org/[slug]/tickets/[ticketId]/ticket-detail.tsx` — Embed `<TicketComments />` and SLA chip
- `src/app/org/[slug]/settings/page.tsx` — Add SLA Policy editor tab and Webhooks management tab

**Final verification commands:**
```bash
export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"
npm test
npx tsc --noEmit
npm run lint
npx next build --webpack
```
Expected: All tests pass, 0 TypeScript errors, 0 lint errors, clean production build.

---

## Global Constraints (copy these into every agent prompt)

- Always run Node 22: `export PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"`
- Branch: `feat/phase-3-sla-automations`
- All subpath aliases use `#prefix/module` pattern — check `package.json` `"imports"` before adding new ones
- All Server Actions must call `assertTenantScoping(context, orgId)` from `@/lib/data/tenant`
- All new Supabase tables must have RLS anchored to `get_auth_user_org_ids()` or `has_org_role()`
- Upstash Redis client must have offline mock fallback for local `npm test` runs
- Production build: `npx next build --webpack`

