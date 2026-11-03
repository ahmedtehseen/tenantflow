# Glossary

Ubiquitous language for TenantFlow domain models, access controls, and multi-tenancy primitives.

---

### Core Domain Entities

#### Organization
- **Definition:** The top-level customer and administrative boundary (`public.organizations`). Owns all tenant data, members, settings, billing, and tickets.
- **Database Table:** `public.organizations`
- **Synonyms to Avoid:** Avoid "Company" or "Account" when referring to the tenant entity.

#### Workspace
- **Definition:** The member-facing operational environment for an organization accessible at `/org/[slug]`. Where members view dashboards, collaborate on tickets, and manage team settings.
- **Route:** `/org/[slug]`

#### Tenant
- **Definition:** The logical isolation boundary represented by an Organization. Every query, mutation, and policy operates within a specific tenant context.

#### Slug
- **Definition:** A unique, URL-safe string (2–63 characters, lowercase alphanumeric with hyphens) representing the organization in the browser route (`/org/[slug]`).

#### Public Directory (`is_public_directory`)
- **Definition:** An organization configuration flag. When `false` (default), foreign requests to `/org/[slug]` return a zero-knowledge `404 Not Found`. When `true`, foreign requests render a `403 Access Denied` with the organization name.
- **Purpose:** Prevents tenant enumeration and reconnaissance by malicious users (ADR 0001).

#### Member
- **Definition:** An authenticated user who has an active role in an organization.
- **Database Table:** `public.organization_members`
- **Roles:**
  - `owner`: Full control, can delete organization, manage billing, and assign any role.
  - `admin`: Operational management, can invite/remove members and manage tickets.
  - `member`: Standard operational access, can create and manage assigned tickets.

#### Invitation
- **Definition:** A pending, token-backed invitation allowing a specified email address to join an organization with an assigned role.
- **Database Table:** `public.organization_invitations`
- **Lifecycle:** `pending` &rarr; `accepted` | `expired` | `revoked`
- **Invariants:** Users are never directly attached to an organization without an accepted invitation (ADR 0002).

#### Ticket
- **Definition:** An operational task or issue created within an organization (`public.tickets`).
- **Lifecycle & State Machine (ADR 0004):**
  - `open` &rarr; `in_progress` (Any workspace member or assignee)
  - `in_progress` &rarr; `resolved` (Assignee, Admin, or Owner)
  - `in_progress` &rarr; `open` (Assignee, Admin, or Owner)
  - `resolved` &rarr; `closed` (Ticket Author, Admin, or Owner verification)
  - `resolved` &rarr; `in_progress` (Author, Assignee, Admin, or Owner rejection)
  - `closed` &rarr; `open` (Admin or Owner only)
- **Invariants:** Must belong to exactly one organization; assignee (if present) must be an active member of that same organization. Direct jumps between non-adjacent states (e.g. `open` &rarr; `closed`) are prohibited.

#### Realtime Workspace
- **Definition:** The interactive, live-synchronized collaboration environment for an organization accessible at `/org/[slug]`. Propagates ticket mutations (inserts, updates, deletes) instantaneously across connected clients via Supabase Realtime WebSocket channels without manual page reloads (ADR 0006).

#### Kanban Board
- **Definition:** A visual, column-oriented ticket workspace displaying tickets categorized by status (`open`, `in_progress`, `resolved`, `closed`). Supports drag-and-drop status transitions with client-side FSM validation (ADR 0004), RBAC checks (ADR 0005), and optimistic rollback on server rejection (ADR 0006).

#### Presence
- **Definition:** Real-time collaborative awareness tracking which teammates are actively browsing an organization's workspace or viewing a specific ticket (`PresenceUser`). Synchronized via Supabase Presence channels and deduplicated by user ID across multiple open tabs or windows (ADR 0006).

---

### Architectural & Security Patterns

#### Dual Verification
- **Definition:** The defensive practice in Server Actions and Route Handlers where the application resolves the active tenant via `getTenantContext(slug)` and explicitly asserts that `targetOrgId === context.currentOrg.id` before executing any database mutation, guarding against confused-deputy attacks (ADR 0003).

#### Zero-Knowledge Isolation
- **Definition:** The architectural principle where non-member requests cannot determine whether a given organization slug or user email exists in the system.
