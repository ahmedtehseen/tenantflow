# ADR 0001: Tenant Enumeration Defense via Opt-In Public Directory

## Status
Accepted

## Context
In `/org/[slug]`, when an authenticated user attempts to access an organization slug that they are not a member of, the application previously used `createAdminClient()` (service-role key) to check if the organization existed in `public.organizations`. If found, it returned `currentRole: null` and rendered an "Access Denied" (403) screen showing the organization's name.

This introduced a tenant reconnaissance vulnerability: any logged-in user could systematically probe slugs (e.g. `/org/acme`, `/org/stripe`) to discover private tenant organizations and their names.

## Decision
We adopt **Zero-Knowledge Isolation by default with an Opt-In Public Directory (`is_public_directory`)**:
1. Add `is_public_directory boolean not null default false` to `public.organizations`.
2. When a user requests `/org/[slug]` and is not a member:
   - Check if `is_public_directory` is `true` for that organization.
   - If `true`, render the informative `403 Access Denied` screen with tenant details.
   - If `false` (default) or the organization does not exist, immediately trigger `notFound()` (404).
3. The existence of private tenants is completely opaque to non-members.

## Consequences
- **Positive:** Protects customer privacy and eliminates tenant enumeration attacks.
- **Positive:** Eliminates redundant privileged admin queries for private tenants.
- **Negative:** Users who are invited or expecting access to a private organization may see a 404 until their invitation is accepted or access is granted.

