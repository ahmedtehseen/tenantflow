-- =============================================================================
-- TenantFlow: 02_foundation_hardening
--
-- Foundation hardening:
--   * organizations: add is_public_directory flag (ADR 0001)
--   * organizations: allow select when is_public_directory = true
--   * organization_invitations: token-based invitation engine (ADR 0002)
--   * organization_invitations RLS policies: admin management & recipient access
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organizations: Opt-in Public Directory
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists is_public_directory boolean not null default false;

-- Allow select on organizations when is_public_directory = true
create policy "organizations_select_public_directory"
  on public.organizations for select
  to anon, authenticated
  using (is_public_directory = true);

grant select on public.organizations to anon;

-- -----------------------------------------------------------------------------
-- 2. Organization Invitations Table
-- -----------------------------------------------------------------------------
create table public.organization_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  email            text not null,
  role             text not null check (role in ('admin', 'member')),
  token            text not null unique,
  invited_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  revoked_at       timestamptz
);

-- Partial unique index: prevent duplicate active invitations for the same email per org
create unique index idx_unique_active_invitation
  on public.organization_invitations(organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Lookup indexes
create index organization_invitations_organization_id_idx
  on public.organization_invitations(organization_id);

create index organization_invitations_email_idx
  on public.organization_invitations(lower(email));

-- -----------------------------------------------------------------------------
-- 3. Row Level Security: organization_invitations
-- -----------------------------------------------------------------------------
alter table public.organization_invitations enable row level security;

revoke all on public.organization_invitations from anon;
grant select, insert, update on public.organization_invitations to authenticated;

-- Organization owners/admins can view all invitations for their organization
create policy "invitations_select_admin"
  on public.organization_invitations for select
  to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- Organization owners/admins can insert invitations
create policy "invitations_insert_admin"
  on public.organization_invitations for insert
  to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- Organization owners/admins can update invitations (for revoking)
create policy "invitations_update_admin"
  on public.organization_invitations for update
  to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- Authenticated users can view invitations sent to their email
create policy "invitations_select_recipient"
  on public.organization_invitations for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
