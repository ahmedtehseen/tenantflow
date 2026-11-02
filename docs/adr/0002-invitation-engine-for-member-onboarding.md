# ADR 0002: Token-Based Invitation Engine for Member Onboarding

## Status
Accepted

## Context
Previously, adding a member (`addMemberAction`) performed a direct email lookup across all registered users in `public.profiles` using `createAdminClient()`. If a profile existed, it immediately inserted a row into `public.organization_members`. If not, it threw an error instructing the user to sign up first.

This caused two problems:
1. **User Enumeration:** Any organization admin could probe arbitrary email addresses to see if that individual has an active TenantFlow account.
2. **Missing Consent & Unregistered Users:** Users were attached to organizations without accepting an invite, and prospective team members could not be invited prior to registration.

## Decision
We implement a **Full Token-Backed Invitation Engine**:
1. Introduce `public.organization_invitations` table:
   - `id uuid primary key default gen_random_uuid()`
   - `organization_id uuid not null references public.organizations(id) on delete cascade`
   - `email text not null`
   - `role public.org_role not null default 'member'`
   - `token text not null unique`
   - `invited_by uuid references public.profiles(id) on delete set null`
   - `expires_at timestamptz not null`
   - `accepted_at timestamptz`
   - `created_at timestamptz not null default now()`
2. Admins create invitations by email and role. No direct query on `public.profiles` is conducted.
3. System issues an invitation link (`/invite/[token]`).
4. Invitee accepts the invitation while signed in. If not signed in or not registered, they are routed through auth with a return parameter to `/invite/[token]`.
5. Upon acceptance, the database creates the `organization_members` row and marks the invitation as accepted in a single atomic transaction.

## Consequences
- **Positive:** Closes the user enumeration hole; zero profile queries required to invite members.
- **Positive:** Unregistered users can be invited seamlessly.
- **Positive:** Users explicitly consent before joining an organization.
- **Negative:** Requires an invitation acceptance page and email dispatch pipeline.

