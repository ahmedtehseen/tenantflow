# Phase 3: SLA Management, Automations & Notifications Design Specification

**Date:** 2026-11-10  
**Status:** Approved for Planning (Superpowers Design Gate)  
**Author:** Antigravity & Engineering  
**Project:** TenantFlow (`owkqbuypklkoaiddmnbt`)  

---

## 1. Intent & Executive Summary

TenantFlow currently provides multi-tenant ticket operations with strict Row Level Security (RLS), a role-gated Finite State Machine (FSM, ADR 0004), mutation RBAC with an immutable activity log (ADR 0005), and a collaborative real-time Kanban board with presence tracking (ADR 0006).

**Phase 3** elevates TenantFlow into an enterprise-grade operational desk by adding:
1. **Configurable SLA Policies & Business Hours Engine:** Organization-level working hours and timezone schedules, calculating First Response Time (FRT) and Resolution Time (TTR) deadlines per priority, with live countdown badges and proactive breach detection.
2. **Collaborative Ticket Comments & Teammate @Mentions:** Markdown-enabled discussion stream with editable/deletable comments, real-time Supabase replication, and structured `@[Display Name](uuid)` mention tagging.
3. **In-App Notification Center:** Workspace header notification bell with an unread badge counter, realtime push alerts, and direct navigation for assignments, mentions, status transitions, and SLA warnings.
4. **Outbound Webhooks with Upstash Redis Persistent Retry Queue:** Event dispatching (`ticket.created`, `ticket.status_changed`, `ticket.commented`, `sla.breached`) with HMAC-SHA256 signature verification, backed by Upstash Redis for persistent queueing, exponential backoff retries, and delivery audit logging.
5. **Periodic Background Worker (Every 30 Mins):** Scheduled automation inspecting unattended ticket SLA deadlines and processing delayed webhook retries.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Deterministic Business Hours SLA:** Accurately compute deadlines according to organization operating hours (e.g. Mon–Fri 9am–5pm in custom IANA timezones), pausing clocks overnight and over weekends.
- **Milestone-Driven Transitions:** Transitioning to `in_progress` satisfies First Response; transitioning to `resolved` satisfies Resolution.
- **Collaborative Discussion:** Support rich Markdown comments with `@mention` member autocompletion, live synchronization, and author/admin edit and delete privileges.
- **Targeted Real-Time Notification Delivery:** Instant in-app notification toasts and unread count badge in `<TenantNav>` using Supabase Realtime without spamming unrelated workspace members.
- **Reliable Webhook Delivery:** Cryptographically signed outbound webhooks, backed by an Upstash Redis queue for persistent retries on network or endpoint failure, with comprehensive delivery logs.
- **Proactive Breach Detection:** Periodic 30-minute worker sweeps catching overdue tickets even when unviewed.

### Non-Goals
- **External Email Delivery:** Phase 3 purposefully excludes external email SMTP/Resend integrations to keep operational focus on the in-app experience and avoid third-party email configuration overhead.
- **Customer Portal Authentication:** Comments and tickets remain scoped to authenticated organization members; public anonymous customer ticketing portals are reserved for future phases.

### Anti-Goals
- **Wall-Clock SLA Blindness:** Never mark a ticket as breached during non-business hours (e.g., Saturday night) if the organization operates strictly on weekday business hours.
- **Unauthenticated Webhooks:** Never send unsigned webhook payloads; endpoints must always verify authenticity via HMAC-SHA256 headers.
- **Silent Job Drops:** Failed webhook deliveries must never be discarded without logging and retry attempts.
- **Notification Spam:** Never notify users for actions they themselves performed, and never blast all workspace members on standard ticket moves.

---

## 3. Constraints

- **Node.js Environment:** Always use Node 22 via `PATH="/Users/digitaleap/.nvm/versions/node/v22.23.4/bin:$PATH"` for all tests, build commands, and script execution.
- **Existing Test Suite:** All 144 existing unit and integration tests in `tests/**/*.test.ts` must continue to pass without regressions.
- **Next.js 16 & React 19:** Strict adherence to Next.js 16 conventions (`cacheComponents`, proxy in `src/proxy.ts`, Suspense wrappers for dynamic hooks).
- **Tenant Isolation:** All newly created Supabase tables must implement RLS policies anchored to `get_auth_user_org_ids()` and verified through `assertTenantScoping`.
- **Upstash Redis Free Tier Safeguards:** Queue mechanisms must stay well within Upstash free limits (max 500k monthly commands, 250MB storage, 1 database connection) by utilizing compact JSON payloads and expiring processed delivery receipts after 7 days.

---

## 4. Architectural Approaches Considered & Selected

### Approach 1: Integrated Database-Driven Outbox
- **Description:** Store pending webhook retries directly in Supabase Postgres, retrying via client triggers.
- **Cons:** Places polling query overhead on primary database; lacks dedicated scheduling semantics.

### Approach 2: Cloud-Native Upstash Redis Queue & Supabase Hybrid (Selected)
- **Description:** Supabase remains the single source of truth for business data (SLA policies, comments, notifications, webhook configurations, delivery history). Upstash Redis manages the asynchronous webhook delivery queue and delayed retry scheduling via Redis sorted sets (`ZADD` with future retry timestamps).
- **Rationale:** Selected by human partner to showcase modern cloud-native distributed architecture, rate-limiting, and resilient background job execution while utilizing Upstash free-tier limits efficiently.

---

## 5. Detailed System Design & Components

### 5.1 SLA Policies & Business Hours Calculation Engine

#### Database Schema: `public.organization_sla_policies`
```sql
create table if not exists public.organization_sla_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  timezone text not null default 'UTC',
  business_days integer[] not null default '{1,2,3,4,5}', -- 1 = Mon, 7 = Sun
  business_start_time time not null default '09:00:00',
  business_end_time time not null default '17:00:00',
  urgent_response_minutes integer not null default 60,       -- 1 hour
  urgent_resolution_minutes integer not null default 240,     -- 4 hours
  high_response_minutes integer not null default 240,         -- 4 hours
  high_resolution_minutes integer not null default 1440,      -- 24 hours
  medium_response_minutes integer not null default 480,       -- 8 hours
  medium_resolution_minutes integer not null default 2880,    -- 48 hours
  low_response_minutes integer not null default 1440,         -- 24 hours
  low_resolution_minutes integer not null default 4320,       -- 72 hours
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### Ticket SLA Tracking Columns (`public.tickets`):
- `first_response_due_at timestamptz`: Calculated deadline based on business hours.
- `resolution_due_at timestamptz`: Calculated resolution deadline based on business hours.
- `first_responded_at timestamptz`: Set when status transitions from `open` to `in_progress`.
- `first_response_breached boolean not null default false`: Recorded if `first_responded_at > first_response_due_at` or if current time exceeds due date while still open.
- `resolved_at timestamptz`: Set when status transitions to `resolved`.
- `resolution_breached boolean not null default false`: Recorded if `resolved_at > resolution_due_at` or current time exceeds due date while unresolved.

#### Pure Calculation Module (`src/lib/sla/business-hours.ts`):
- `calculateBusinessDeadline(startTime, targetMinutes, policy)`: Computes deadline by advancing minutes strictly within business windows and skipping weekend/off-hour spans.
- `getSLAStatus(now, dueAt, completedAt, isBusinessOpen)`: Returns:
  - `met`: Completed prior to due date.
  - `breached`: Overdue.
  - `at_risk`: Within 20% or 1 hour of breach during active business hours.
  - `on_track`: Normal progress.
  - `paused`: Currently outside active business hours.

#### Business Rules on Mutating Actions:
- **Priority Changes:** Recalculates `first_response_due_at` and `resolution_due_at` from original `created_at` timestamp.
- **Reopening Tickets:** When a `resolved` or `closed` ticket is reopened (allowed for admins/owners per ADR 0004), `resolved_at` is cleared to NULL, and `resolution_breached` is re-evaluated.
- **Default Policy Seeding:** Organizations automatically receive a default policy row upon creation via trigger; existing organizations receive default rows in migration.

---

### 5.2 Ticket Discussion Comments & Teammate @Mentions

#### Database Schema: `public.ticket_comments`
```sql
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_edited boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### RLS & Permissions:
- Members of the ticket's organization have SELECT and INSERT access.
- Authors can UPDATE and DELETE their own comments.
- Workspace Owners and Admins can DELETE any comment (moderation).
- Deletions create a `comment_deleted` entry in `public.ticket_activities`.
- Registered in `supabase_realtime` publication for instant streaming.

#### Mention Detection:
- Client-side autocomplete inserts structured tokens: `@[Full Name](profile-uuid)`.
- Server regex parser `/@\[(.*?)\]\(([a-f0-9-]+)\)/g` extracts mentioned member UUIDs during comment creation and queues in-app notifications without modifying the `profiles` schema.

---

### 5.3 In-App Notification Center

#### Database Schema: `public.notifications`
```sql
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete cascade,
  type text not null, -- 'ticket_assigned' | 'mention' | 'status_changed' | 'sla_breached' | 'sla_at_risk'
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
```

#### Recipient Targeting Matrix:
- **`ticket_assigned`**: Sent to the new assignee (if assignee != actor).
- **`mention`**: Sent to each member mentioned in the comment body (if recipient != actor).
- **`status_changed`**: Sent specifically to the **ticket author and the current assignee** (the actor who initiated the change is strictly excluded).
- **`sla_breached` & `sla_at_risk`**: Sent to the ticket assignee; if the ticket is unassigned, routed to all workspace **Owners and Admins**.

#### UI Components & Navigation:
- `<NotificationBell />` mounted in `TenantNav`:
  - Displays unread counter badge.
  - Subscribed to Supabase Realtime channel `notifications:user:${userId}`.
  - Dropdown panel showing recent notifications with "Mark as read" and "Mark all as read" buttons.
  - Clicking an item marks it read and routes directly to `/org/[slug]/tickets/[ticketId]`.

---

### 5.4 Outbound Webhooks & Upstash Redis Persistent Retry Queue

#### Database Schema: `public.organization_webhooks` & `public.webhook_deliveries`
```sql
create table if not exists public.organization_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  url text not null,
  secret text not null, -- HMAC secret key
  description text,
  events text[] not null default '{ticket.created,ticket.status_changed,ticket.commented,sla.breached}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.organization_webhooks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'pending', -- 'pending' | 'delivered' | 'failed'
  last_status_code integer,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
```

#### Upstash Redis Integration (`@upstash/redis`):
- **Client Factory:** `src/lib/redis/client.ts` initializes Upstash REST client using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (with mock fallback for offline tests).
- **Enqueueing:** When a webhook event fires, the payload is recorded in `webhook_deliveries` and an immediate dispatch is executed.
- **Retry Schedule (Delayed Set):** On failure (HTTP status >= 400 or network timeout), the delivery ID is added to a Redis sorted set `webhooks:retry_zset` with score = `Date.now() + backoffMs` (Exponential backoff: 1 min, 5 min, 15 min, 1 hour, 6 hours).

---

### 5.5 Scheduled Background Worker (30-Min Cadence)

#### Worker Endpoint (`/api/cron/process-background-jobs`):
- **Authentication:** Protected with Bearer token header (`Authorization: Bearer ${CRON_SECRET}`).
- **Execution Cadence:** Every 30 minutes (via Upstash QStash, Vercel Cron, or external trigger).
- **Privileged Scope:** Uses Supabase Service Role client to safely evaluate across organizations.
- **Worker Tasks:**
  1. **SLA Breach Sweep:** Scans open tickets with past due dates (`first_response_due_at < now()` or `resolution_due_at < now()`). Sets breach flags, logs `sla_breached` activities, queues notifications, and dispatches `sla.breached` webhook events.
  2. **Webhook Retry Sweep:** Queries `webhooks:retry_zset` for ready jobs (`score <= Date.now()`). Re-attempts HTTP POST, records response status, and increments attempt count or marks permanently failed.
- **Manual Retry Action:** Workspace Admins can trigger manual retries for failed deliveries directly from `/org/[slug]/settings/webhooks`.

---

## 6. Sized Scope & Builder Checklist

- **Size:** Major Project.
- **Verification Plan:**
  - Pure unit tests for `src/lib/sla/business-hours.ts` (100% boundary testing across weekends, holidays, nights, and timezones).
  - Integration tests for comment CRUD, mention parsing, and RLS policies.
  - Notification targeting matrix tests verifying actor exclusion and author/assignee targeting.
  - Webhook payload signature tests (HMAC-SHA256) and Upstash Redis retry backoff calculations.
  - All 144 pre-existing tests preserved and green.
