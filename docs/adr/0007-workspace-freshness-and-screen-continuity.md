# Workspace freshness and screen continuity

## Status

Accepted on 2026-11-13 after confirmation of the complete behavior.

## Context

Workspace members encounter stale ticket lists and totals after creating, editing, or deleting tickets. Returning to visited screens can show a skeleton and lose working context. ADR 0006 established realtime collaboration, and this improvement completes its freshness guarantees across workspace navigation and successful mutations.

Inspection found that the ticket realtime hook initializes a local array from server data once and ignores subsequent server snapshots. Mutation actions already revalidate routes. Realtime subscriptions also need catch-up after inactive periods. The installed Next.js version preserves a limited number of routes, and route revalidation can cause previously visited screens to refresh. View choices currently depend on a URL parameter and temporary component state.

## Agreed behavior

- Remember each screen's view preference separately for each user and organization in the current browser. Restore it after refresh and signing back in. Each browser and device maintains its own preference.
- Returning to a visited screen restores its last displayed data, search, filters, sorting, pagination, and scroll position wherever those controls exist. Check for fresh data in the background.
- Apply the improvement throughout the workspace, including Overview, Tickets, ticket details, Team & Members, Settings, and shared summaries affected by changes.

## Completion contract

- A successful create, edit, delete, or status transition updates the affected records, lists, and summaries without a manual refresh. Include both ticket List and Board views.
- A successful mutation reaches the initiating user's screen even when realtime delivery is delayed or unavailable. Reconcile realtime changes and refreshed server data consistently.
- Previously visited screens display their retained content during background refresh. Use a skeleton when a screen has no usable data to display.
- Reconcile changes missed while navigating away or while a realtime connection is interrupted when the screen becomes active again or reconnects.
- Failed mutations display an actionable error and preserve a consistent visible state. Rejected optimistic changes roll back safely.
- Background refresh failures retain the last usable content and show refresh failure feedback with a retry action.
- Preserve unsaved form edits during background updates. Recheck authorization when access changes, and scope retained data to the authenticated user and organization. Clear retained workspace data when the authenticated session ends.
- Keep workspace data available during the signed-in session. Persist view preferences in the browser across sessions.

## Acceptance checks

- Create a ticket, edit its title, priority, assignee, and status, then delete it. Check detail, List, Board, counts, and Overview for consistent results without refreshing the browser.
- Repeat successful mutations with realtime delivery unavailable, then reconnect and confirm catch-up without duplicate records or resurrected deletions.
- Choose Board, refresh, follow a bare Tickets link, navigate away and back, then sign out and back in. Confirm the preference for that user and organization is retained.
- Verify separate users and organizations retain their own preferences and receive only their authorized workspace data.
- Set available search and filters, scroll, then visit at least four distinct workspace screens before returning. Confirm the restored context remains visible during background refresh.
- Change data while a screen is inactive, then return. Confirm retained content appears first and reconciles with current server data.
- Reject a mutation and interrupt a background refresh. Confirm clear error feedback, safe rollback where applicable, retained usable content, and working retry.
- Edit an unsaved ticket or settings field while a background update arrives. Confirm the draft survives and successful saves reconcile with server state.

## Decision

Use SWR with a browser-memory cache owned by the authenticated user and organization. Existing workspace queries remain in the server data layer and are served through an authorized, private, uncached read endpoint. Screen components reuse their previous data during background reads, including after Next.js evicts a route. Each screen activation forces catch-up, including React Activity resumes within the normal request-deduplication window.

Confirmed ticket, organization, SLA policy, and webhook writes update the workspace cache from their server-returned records before revalidation. Draft baselines clear after the confirmed records are cached, preserving saved values when a follow-up read fails. Mutation callers await workspace revalidation after the server action. Ticket List reconciles incoming snapshots, and Board transitions roll back before authoritative revalidation. Private database Broadcast notifications cover organizations, members, invitations, SLA policies, webhooks, deliveries, tickets, and activities. Their payload contains the changed table name. A membership-scoped policy authorizes private workspace topics. Insert, update, and delete triggers emit the same invalidation hint. Realtime events, subscription recovery, browser focus, reconnection, and screen activation refresh both cached screens and the shared server layout, keeping organization names and SLA calculations current.

Store working screen context and form drafts in workspace memory. Save the ticket view preference in browser storage using the user, organization, and screen as its scope. Valid explicit URL views take precedence. Field-level draft baselines let untouched fields follow background updates while retaining edited values. Successful submissions clear their draft baselines. Sign-out uses a full document navigation to release retained routes and all workspace memory.

SWR adds a dependency to centralize request ordering, deduplication, and mutation coordination. The workspace provider forces catch-up on focus, visibility recovery, and reconnection so rapid returns also receive a fresh check. Workspace data loads on the client after the authorized layout renders, so a first visit waits for the data request. Subsequent visits can display the cached screen immediately. Authorization and query scoping run on every server read and mutation.

## Verification

The repository test suite passes all 248 tests. Type checking, lint, and the production build pass. Twenty-seven production-browser checks passed against an isolated Supabase-compatible service, including delayed reads, rejected writes, unavailable realtime delivery, private Broadcast delivery, channel recovery, shared layout catch-up, and successful saves followed by failed reads for ticket, organization, SLA policy, and webhook forms.

PostgreSQL/PGlite checks exercise the migration triggers, private-topic membership policy, restricted function privileges, and deletion notifications. Regression tests also cover saved-record cache reconciliation, stale response ordering, tenant isolation, ticket snapshot reconciliation, preferences, working-context retention, and read authorization/error responses. Browser transport checks use mocked WebSockets. Hosted Supabase authorization and websocket recovery remain outside this verification environment.

## Deployment

Apply `supabase/migrations/20261113174538_workspace_realtime_sync.sql` to hosted Supabase during deployment to activate private workspace notifications. Its policy and triggers use Supabase's native Realtime database functions.
