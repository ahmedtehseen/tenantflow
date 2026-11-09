-- =============================================================================
-- TenantFlow: 05_phase_3_sla_notifications_webhooks
--
-- SLA Policies, Ticket Comments, In-App Notifications, Outbound Webhooks & Deliveries:
--   * organization_sla_policies: Working hours and target response/resolution times
--   * tickets: SLA tracking columns (first_response_due_at, resolution_due_at, etc.)
--   * ticket_activities: Expand activity_type constraint for comment_deleted & sla_breached
--   * ticket_comments: Discussion comments with author/admin permissions & audit trigger
--   * notifications: In-app notification center targeted to recipients
--   * organization_webhooks: Outbound webhooks registry with HMAC secrets
--   * webhook_deliveries: Delivery attempt logs and retry tracking
--   * Realtime: Add ticket_comments & notifications to supabase_realtime publication
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SLA Policies Table & Default Seeding
-- -----------------------------------------------------------------------------
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

create index if not exists idx_organization_sla_policies_org
  on public.organization_sla_policies(organization_id);

create trigger organization_sla_policies_set_updated_at
  before update on public.organization_sla_policies
  for each row execute function public.set_updated_at();

alter table public.organization_sla_policies enable row level security;

revoke all on public.organization_sla_policies from anon;
grant select, insert, update, delete on public.organization_sla_policies to authenticated;

-- Organization members can view their organization SLA policy
create policy "organization_sla_policies_member_select"
  on public.organization_sla_policies for select
  to authenticated
  using (public.user_is_member_of(organization_id));

-- Workspace Owners and Admins have full access to configure SLA policies
create policy "organization_sla_policies_admin_write"
  on public.organization_sla_policies for all
  to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- Trigger function to auto-seed default SLA policy for newly created organizations
create or replace function public.seed_organization_default_sla_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_sla_policies (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_organization_default_sla_policy() from public, anon;
grant execute on function public.seed_organization_default_sla_policy() to authenticated;

drop trigger if exists on_organization_created_seed_sla on public.organizations;
create trigger on_organization_created_seed_sla
  after insert on public.organizations
  for each row execute function public.seed_organization_default_sla_policy();

-- Backfill default SLA policy for any existing organizations lacking one
insert into public.organization_sla_policies (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Ticket SLA Tracking Columns
-- -----------------------------------------------------------------------------
alter table public.tickets
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolution_due_at timestamptz,
  add column if not exists first_responded_at timestamptz,
  add column if not exists first_response_breached boolean not null default false,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_breached boolean not null default false;

create index if not exists idx_tickets_sla_response_due
  on public.tickets(first_response_due_at);

create index if not exists idx_tickets_sla_resolution_due
  on public.tickets(resolution_due_at);

-- -----------------------------------------------------------------------------
-- 3. Ticket Activities: Allow new Phase 3 activity types
-- -----------------------------------------------------------------------------
alter table public.ticket_activities
  drop constraint if exists ticket_activities_activity_type_check;

alter table public.ticket_activities
  add constraint ticket_activities_activity_type_check
  check (activity_type in (
    'created',
    'status_changed',
    'priority_changed',
    'assignee_changed',
    'details_updated',
    'comment_deleted',
    'sla_breached'
  ));

-- -----------------------------------------------------------------------------
-- 4. Ticket Comments Table
-- -----------------------------------------------------------------------------
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

create index if not exists idx_ticket_comments_ticket_created
  on public.ticket_comments(ticket_id, created_at asc);

create index if not exists idx_ticket_comments_org_id
  on public.ticket_comments(organization_id);

create trigger ticket_comments_set_updated_at
  before update on public.ticket_comments
  for each row execute function public.set_updated_at();

alter table public.ticket_comments enable row level security;

revoke all on public.ticket_comments from anon;
grant select, insert, update, delete on public.ticket_comments to authenticated;

-- RLS: member_select
create policy "ticket_comments_member_select"
  on public.ticket_comments for select
  to authenticated
  using (public.user_is_member_of(organization_id));

-- RLS: member_insert
create policy "ticket_comments_member_insert"
  on public.ticket_comments for insert
  to authenticated
  with check (
    public.user_is_member_of(organization_id)
    and author_id = (select auth.uid())
  );

-- RLS: author_update
create policy "ticket_comments_author_update"
  on public.ticket_comments for update
  to authenticated
  using (
    public.user_is_member_of(organization_id)
    and author_id = (select auth.uid())
  )
  with check (
    public.user_is_member_of(organization_id)
    and author_id = (select auth.uid())
  );

-- RLS: author_or_admin_delete
create policy "ticket_comments_author_or_admin_delete"
  on public.ticket_comments for delete
  to authenticated
  using (
    public.user_is_member_of(organization_id)
    and (
      author_id = (select auth.uid())
      or public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    )
  );

-- Trigger: log comment deletion activity to ticket_activities
create or replace function public.log_comment_deleted_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_activities (
    organization_id,
    ticket_id,
    actor_id,
    activity_type,
    old_value,
    new_value,
    metadata
  ) values (
    old.organization_id,
    old.ticket_id,
    (select auth.uid()),
    'comment_deleted',
    null,
    null,
    jsonb_build_object(
      'comment_id', old.id,
      'author_id', old.author_id,
      'truncated_content', substring(old.content from 1 for 100)
    )
  );
  return old;
end;
$$;

revoke all on function public.log_comment_deleted_activity() from public, anon;
grant execute on function public.log_comment_deleted_activity() to authenticated;

drop trigger if exists on_comment_deleted_log_activity on public.ticket_comments;
create trigger on_comment_deleted_log_activity
  after delete on public.ticket_comments
  for each row execute function public.log_comment_deleted_activity();

-- -----------------------------------------------------------------------------
-- 5. Notifications Table
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications(recipient_id)
  where read_at is null;

create index if not exists idx_notifications_org_id
  on public.notifications(organization_id);

alter table public.notifications enable row level security;

revoke all on public.notifications from anon;
grant select, insert, update on public.notifications to authenticated;

-- RLS: recipient_select
create policy "notifications_recipient_select"
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

-- RLS: recipient_update (e.g. mark as read)
create policy "notifications_recipient_update"
  on public.notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- RLS: member_insert
create policy "notifications_member_insert"
  on public.notifications for insert
  to authenticated
  with check (public.user_is_member_of(organization_id));

-- -----------------------------------------------------------------------------
-- 6. Outbound Webhooks & Deliveries Tables
-- -----------------------------------------------------------------------------
create table if not exists public.organization_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  url text not null,
  secret text not null,
  description text,
  events text[] not null default '{ticket.created,ticket.status_changed,ticket.commented,sla.breached}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_webhooks_org_id
  on public.organization_webhooks(organization_id);

alter table public.organization_webhooks enable row level security;

revoke all on public.organization_webhooks from anon;
grant select, insert, update, delete on public.organization_webhooks to authenticated;

-- RLS: admin/owner only
create policy "organization_webhooks_admin_access"
  on public.organization_webhooks for all
  to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.organization_webhooks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'pending',
  last_status_code integer,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists idx_webhook_deliveries_webhook_id
  on public.webhook_deliveries(webhook_id, created_at desc);

create index if not exists idx_webhook_deliveries_org_id
  on public.webhook_deliveries(organization_id);

create index if not exists idx_webhook_deliveries_pending_retry
  on public.webhook_deliveries(status, next_retry_at)
  where status = 'pending';

alter table public.webhook_deliveries enable row level security;

revoke all on public.webhook_deliveries from anon;
grant select, insert, update, delete on public.webhook_deliveries to authenticated;

-- RLS: admin/owner only
create policy "webhook_deliveries_admin_access"
  on public.webhook_deliveries for all
  to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- -----------------------------------------------------------------------------
-- 7. Realtime Publications
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.ticket_comments, public.notifications;

alter table public.ticket_comments replica identity full;
alter table public.notifications replica identity full;
