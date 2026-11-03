-- =============================================================================
-- TenantFlow: 03_ticket_activities
--
-- Ticket Activity Audit Log:
--   * Helper function: user_is_member_of(org_id)
--   * Table: public.ticket_activities
--   * Indexes for timeline queries and tenant filtering
--   * Row Level Security: append-only audit trail (select & insert only)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper function: user_is_member_of
-- -----------------------------------------------------------------------------
create or replace function public.user_is_member_of(p_org_id uuid)
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
  );
$$;

revoke all on function public.user_is_member_of(uuid) from public, anon;
grant execute on function public.user_is_member_of(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Ticket Activities Table
-- -----------------------------------------------------------------------------
create table public.ticket_activities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  ticket_id        uuid not null references public.tickets(id) on delete cascade,
  actor_id         uuid references public.profiles(id) on delete set null,
  activity_type    text not null check (
    activity_type in ('created', 'status_changed', 'priority_changed', 'assignee_changed', 'details_updated')
  ),
  old_value        text,
  new_value        text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- Indexes for efficient timeline reads and org-level auditing
create index idx_ticket_activities_ticket_id
  on public.ticket_activities(ticket_id, created_at desc);

create index idx_ticket_activities_org_id
  on public.ticket_activities(organization_id);

-- -----------------------------------------------------------------------------
-- 3. Row Level Security: Immutable Audit Log
-- -----------------------------------------------------------------------------
alter table public.ticket_activities enable row level security;

revoke all on public.ticket_activities from anon;
grant select, insert on public.ticket_activities to authenticated;

-- Organization members can select activities for tickets in their organization
create policy "ticket_activities_select"
  on public.ticket_activities for select
  to authenticated
  using (public.user_is_member_of(organization_id));

-- Authenticated members can insert activities for their organization
create policy "ticket_activities_insert"
  on public.ticket_activities for insert
  to authenticated
  with check (
    public.user_is_member_of(organization_id)
    and (actor_id is null or actor_id = auth.uid())
  );

-- Explicitly NO update or delete policies: append-only immutable audit log.
