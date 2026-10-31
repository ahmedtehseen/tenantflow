-- =============================================================================
-- TenantFlow: 01_init_multi_tenancy
--
-- Multi-tenant foundation:
--   * organizations          - tenants
--   * profiles               - 1:1 with auth.users (auto-created by trigger)
--   * organization_members   - user <-> org membership with role
--   * tickets                - tenant-scoped operational records
--
-- Tenant isolation is enforced entirely by Row Level Security. Every policy
-- resolves the caller's tenants through the SECURITY DEFINER helper
-- public.get_auth_user_org_ids(), which avoids recursive RLS evaluation on
-- organization_members.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'urgent');

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 63),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.organization_members (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             public.org_role not null default 'member',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.tickets (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  description      text,
  status           public.ticket_status not null default 'open',
  priority         public.ticket_priority not null default 'medium',
  created_by       uuid references public.profiles (id) on delete set null,
  assigned_to      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- An assignee must be a member of the ticket's organization. When the member
  -- is removed, only the assignee column is cleared (PostgreSQL 15+).
  constraint tickets_assignee_is_member
    foreign key (organization_id, assigned_to)
    references public.organization_members (organization_id, user_id)
    on delete set null (assigned_to)
);

-- -----------------------------------------------------------------------------
-- Indexes (RLS predicates and common lookups)
-- -----------------------------------------------------------------------------
create index organization_members_user_id_idx on public.organization_members (user_id);
create index tickets_organization_id_status_idx on public.tickets (organization_id, status);
create index tickets_assigned_to_idx on public.tickets (assigned_to);
create index tickets_created_by_idx on public.tickets (created_by);
create index organizations_created_by_idx on public.organizations (created_by);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Security definer helpers (bypass RLS to prevent policy recursion)
-- -----------------------------------------------------------------------------

-- All organization IDs the current user belongs to.
create or replace function public.get_auth_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid());
$$;

-- Whether the current user holds one of the given roles in an organization.
create or replace function public.has_org_role(p_org_id uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.get_auth_user_org_ids() from public, anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function public.get_auth_user_org_ids() to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Auth trigger: auto-populate public.profiles for every new auth.users row
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when a user changes their auth email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

revoke all on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

-- The creator of an organization automatically becomes its owner.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new.id, new.created_by, 'owner');
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_organization() from public, anon, authenticated;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- Every organization must always retain at least one owner. Cascading deletes
-- of the organization itself are allowed.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  -- Organization is being deleted (cascade) - nothing to protect.
  if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = old.organization_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'An organization must have at least one owner'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.prevent_last_owner_removal() from public, anon, authenticated;

create trigger organization_members_keep_owner
  before update of role or delete on public.organization_members
  for each row execute function public.prevent_last_owner_removal();

-- Membership rows cannot be re-pointed to another org or user.
-- Tickets cannot be moved between tenants or have their author rewritten.
create or replace function public.prevent_tenant_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = 'check_violation';
  end if;

  -- Nested IFs: PL/pgSQL does not guarantee AND short-circuiting, and the
  -- referenced column only exists on one of the tables.
  if tg_table_name = 'organization_members' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id is immutable' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'tickets' then
    -- Allow the FK's ON DELETE SET NULL when the author's profile is deleted.
    if new.created_by is distinct from old.created_by
       and not (
         new.created_by is null
         and not exists (select 1 from public.profiles p where p.id = old.created_by)
       ) then
      raise exception 'created_by is immutable' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_tenant_key_change() from public, anon, authenticated;

create trigger organization_members_immutable_keys
  before update on public.organization_members
  for each row execute function public.prevent_tenant_key_change();

create trigger tickets_immutable_keys
  before update on public.tickets
  for each row execute function public.prevent_tenant_key_change();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.tickets enable row level security;

-- Anonymous users get no access to tenant data at all.
revoke all on public.profiles, public.organizations, public.organization_members, public.tickets from anon;

-- ---- profiles ---------------------------------------------------------------
-- Users can see their own profile and the profiles of people in their orgs.
create policy "profiles_select_self_or_teammates"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members m
      where m.user_id = profiles.id
        and m.organization_id in (select public.get_auth_user_org_ids())
    )
  );

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- No INSERT/DELETE policies: rows are managed by auth triggers / FK cascade.

-- ---- organizations ----------------------------------------------------------
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (
    id in (select public.get_auth_user_org_ids())
    -- Allows INSERT ... RETURNING before the owner membership is visible.
    or created_by = (select auth.uid())
  );

create policy "organizations_insert_authenticated"
  on public.organizations for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "organizations_update_admin"
  on public.organizations for update
  to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

create policy "organizations_delete_owner"
  on public.organizations for delete
  to authenticated
  using (public.has_org_role(id, array['owner']::public.org_role[]));

-- ---- organization_members ---------------------------------------------------
create policy "members_select_same_org"
  on public.organization_members for select
  to authenticated
  using (organization_id in (select public.get_auth_user_org_ids()));

-- Owners can add anyone with any role; admins can add admins/members only.
create policy "members_insert_admin"
  on public.organization_members for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['owner']::public.org_role[])
    or (
      public.has_org_role(organization_id, array['admin']::public.org_role[])
      and role <> 'owner'
    )
  );

-- Owners can change any role; admins cannot touch owners or grant ownership.
create policy "members_update_admin"
  on public.organization_members for update
  to authenticated
  using (
    public.has_org_role(organization_id, array['owner']::public.org_role[])
    or (
      public.has_org_role(organization_id, array['admin']::public.org_role[])
      and role <> 'owner'
    )
  )
  with check (
    public.has_org_role(organization_id, array['owner']::public.org_role[])
    or (
      public.has_org_role(organization_id, array['admin']::public.org_role[])
      and role <> 'owner'
    )
  );

-- Owners remove anyone, admins remove non-owners, and anyone may leave.
create policy "members_delete_admin_or_self"
  on public.organization_members for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_org_role(organization_id, array['owner']::public.org_role[])
    or (
      public.has_org_role(organization_id, array['admin']::public.org_role[])
      and role <> 'owner'
    )
  );

-- ---- tickets ----------------------------------------------------------------
create policy "tickets_select_member"
  on public.tickets for select
  to authenticated
  using (organization_id in (select public.get_auth_user_org_ids()));

create policy "tickets_insert_member"
  on public.tickets for insert
  to authenticated
  with check (
    organization_id in (select public.get_auth_user_org_ids())
    and created_by = (select auth.uid())
  );

create policy "tickets_update_member"
  on public.tickets for update
  to authenticated
  using (organization_id in (select public.get_auth_user_org_ids()))
  with check (organization_id in (select public.get_auth_user_org_ids()));

-- Ticket authors, plus org owners/admins, may delete tickets.
create policy "tickets_delete_author_or_admin"
  on public.tickets for delete
  to authenticated
  using (
    organization_id in (select public.get_auth_user_org_ids())
    and (
      created_by = (select auth.uid())
      or public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    )
  );
