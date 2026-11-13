-- Persist notifications and delivery jobs in the same transaction as their source event.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.tickets add constraint tickets_id_org_unique unique (id, organization_id);
alter table public.ticket_comments add constraint comments_ticket_org_fk
  foreign key (ticket_id, organization_id) references public.tickets(id, organization_id) on delete cascade;
alter table public.ticket_comments add constraint comments_content_length
  check (length(btrim(content)) between 1 and 10000);

create function private.guard_comment_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.ticket_id, new.organization_id, new.author_id, new.created_at)
     is distinct from (old.id, old.ticket_id, old.organization_id, old.author_id, old.created_at) then
    raise exception 'Comment identity cannot be changed';
  end if;
  new.is_edited := true;
  new.edited_at := now();
  return new;
end;
$$;
create trigger comment_identity_before_update before update on public.ticket_comments
  for each row execute function private.guard_comment_update();

-- Members may only change read_at on notifications produced by trusted triggers.
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy notifications_member_insert on public.notifications;
drop policy notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and public.user_is_member_of(organization_id));
drop policy notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and public.user_is_member_of(organization_id))
  with check (recipient_id = (select auth.uid()) and public.user_is_member_of(organization_id));
alter table public.notifications add column source_key text;
create unique index notifications_source_unique
  on public.notifications(organization_id, recipient_id, source_key) where source_key is not null;

alter table public.webhook_deliveries add column claimed_until timestamptz;
alter table public.webhook_deliveries add column claim_token uuid;
alter table public.webhook_deliveries add column event_id uuid not null default gen_random_uuid();
create unique index webhook_event_unique on public.webhook_deliveries(webhook_id, event_id);
alter table public.webhook_deliveries add constraint delivery_status_valid check (status in ('pending', 'delivered', 'failed'));
alter table public.webhook_deliveries add constraint delivery_attempts_valid check (attempts >= 0 and max_attempts between 1 and 10);
-- Only trusted workers write the outbox. Administrators can inspect it through RLS.
revoke insert, update, delete on public.webhook_deliveries from authenticated;

create function private.queue_webhooks(p_org uuid, p_event text, p_payload jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.webhook_deliveries(webhook_id, organization_id, event_type, payload, event_id)
  select w.id, p_org, p_event,
    jsonb_build_object('id', e.id, 'event', p_event, 'created_at', now(), 'data', p_payload), e.id
  from public.organization_webhooks w
  cross join (select gen_random_uuid() as id) e
  where w.organization_id = p_org and w.is_active and p_event = any(w.events);
$$;

create function private.notify_members(p_org uuid, p_ticket uuid, p_actor uuid, p_type text,
  p_title text, p_body text, p_recipients uuid[], p_source text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(organization_id, ticket_id, actor_id, type, title, body, recipient_id, source_key)
  select p_org, p_ticket, p_actor, p_type, left(p_title, 200), left(p_body, 500), m.user_id, p_source
  from public.organization_members m
  where m.organization_id = p_org and m.user_id = any(p_recipients)
    and m.user_id is distinct from p_actor
  on conflict (organization_id, recipient_id, source_key) where source_key is not null do nothing;
$$;

create function private.sla_event(t public.tickets, p_metric text, p_type text, p_due timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare recipients uuid[];
begin
  if t.assigned_to is not null then recipients := array[t.assigned_to];
  else
    select array_agg(user_id) into recipients from public.organization_members
      where organization_id = t.organization_id and role in ('admin', 'owner');
  end if;
  perform private.notify_members(t.organization_id, t.id, auth.uid(), p_type,
    case when p_type = 'sla_breached' then 'SLA breached' else 'SLA at risk' end,
    t.title || ' (' || p_metric || ')', recipients,
    p_type || ':' || t.id || ':' || p_metric || ':' || p_due);
  if p_type = 'sla_breached' then
    insert into public.ticket_activities(organization_id, ticket_id, actor_id, activity_type, metadata)
      values(t.organization_id, t.id, auth.uid(), 'sla_breached', jsonb_build_object('metric', p_metric, 'due_at', p_due));
    perform private.queue_webhooks(t.organization_id, 'sla.breached',
      jsonb_build_object('ticket_id', t.id, 'organization_id', t.organization_id, 'metric', p_metric, 'due_at', p_due));
  end if;
end;
$$;

create function private.ticket_events() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.queue_webhooks(new.organization_id, 'ticket.created', to_jsonb(new));
  elsif new.status is distinct from old.status then
    perform private.notify_members(new.organization_id, new.id, auth.uid(), 'status_changed',
      'Ticket status changed', new.title || ' → ' || new.status, array[new.created_by, new.assigned_to]);
    perform private.queue_webhooks(new.organization_id, 'ticket.status_changed',
      jsonb_build_object('ticket', to_jsonb(new), 'previous_status', old.status));
  end if;
  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    perform private.notify_members(new.organization_id, new.id, auth.uid(), 'ticket_assigned',
      'Ticket assigned to you', new.title, array[new.assigned_to]);
  end if;
  if tg_op = 'UPDATE' then
    if new.first_response_breached and not old.first_response_breached then
      perform private.sla_event(new, 'first_response', 'sla_breached', new.first_response_due_at);
    end if;
    if new.resolution_breached and not old.resolution_breached then
      perform private.sla_event(new, 'resolution', 'sla_breached', new.resolution_due_at);
    end if;
  end if;
  return new;
end;
$$;
create trigger ticket_phase3_events after insert or update on public.tickets
  for each row execute function private.ticket_events();

create function private.comment_events() returns trigger language plpgsql security definer set search_path = '' as $$
declare recipients uuid[];
begin
  select array_agg(distinct lower(matches[1])::uuid) into recipients
    from regexp_matches(new.content, '@\[[^\]\r\n]+\]\(([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\)', 'g') as matches;
  perform private.notify_members(new.organization_id, new.ticket_id, new.author_id, 'mention',
    'You were mentioned in a comment', new.content, recipients, 'mention:' || new.id);
  perform private.queue_webhooks(new.organization_id, 'ticket.commented',
    jsonb_build_object('ticket_id', new.ticket_id, 'organization_id', new.organization_id, 'comment_id', new.id,
      'author_id', new.author_id, 'content', new.content));
  return new;
end;
$$;
create trigger comment_phase3_events after insert on public.ticket_comments
  for each row execute function private.comment_events();

-- A bounded, row-locked sweep can run concurrently without duplicate breach events.
create function public.process_sla_breaches(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare processed integer;
begin
  with due as (
    select t.id from public.tickets t
    join public.organization_sla_policies p on p.organization_id = t.organization_id
    where extract(isodow from p_now at time zone p.timezone)::integer = any(p.business_days)
      and (p_now at time zone p.timezone)::time >= p.business_start_time
      and (p_now at time zone p.timezone)::time < p.business_end_time
      and status in ('open', 'in_progress') and (
      (first_response_due_at < p_now and first_responded_at is null and not first_response_breached) or
      (resolution_due_at < p_now and resolved_at is null and not resolution_breached))
    order by t.id limit 200 for update of t skip locked
  ), changed as (
    update public.tickets t set
      first_response_breached = t.first_response_breached or coalesce(t.first_response_due_at < p_now and t.first_responded_at is null, false),
      resolution_breached = t.resolution_breached or coalesce(t.resolution_due_at < p_now and t.resolved_at is null, false)
    from due where t.id = due.id returning t.id
  ) select count(*) into processed from changed;
  return processed;
end;
$$;
revoke all on function public.process_sla_breaches(timestamptz) from public, anon, authenticated;
grant execute on function public.process_sla_breaches(timestamptz) to service_role;

create function public.notify_sla_at_risk(p_ticket uuid, p_metric text, p_due timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if not found or t.status not in ('open', 'in_progress') then return; end if;
  if (p_metric = 'first_response' and t.first_response_due_at = p_due and t.first_responded_at is null and not t.first_response_breached)
     or (p_metric = 'resolution' and t.resolution_due_at = p_due and t.resolved_at is null and not t.resolution_breached) then
    perform private.sla_event(t, p_metric, 'sla_at_risk', p_due);
  end if;
end;
$$;
revoke all on function public.notify_sla_at_risk(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.notify_sla_at_risk(uuid, text, timestamptz) to service_role;

-- Validate policy input at the database boundary as well as the settings form.
create function private.validate_sla_policy() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone';
  end if;
  if cardinality(new.business_days) = 0 or not new.business_days <@ array[1,2,3,4,5,6,7]
    or new.business_start_time >= new.business_end_time then raise exception 'Invalid business hours'; end if;
  if greatest(new.urgent_response_minutes, new.urgent_resolution_minutes, new.high_response_minutes,
    new.high_resolution_minutes, new.medium_response_minutes, new.medium_resolution_minutes,
    new.low_response_minutes, new.low_resolution_minutes) > 525600 then raise exception 'Targets exceed 525600 minutes'; end if;
  if least(new.urgent_response_minutes, new.urgent_resolution_minutes, new.high_response_minutes,
    new.high_resolution_minutes, new.medium_response_minutes, new.medium_resolution_minutes,
    new.low_response_minutes, new.low_resolution_minutes) <= 0 then raise exception 'Targets must be positive'; end if;
  return new;
end;
$$;
create trigger sla_policy_validate before insert or update on public.organization_sla_policies
  for each row execute function private.validate_sla_policy();

revoke all on all functions in schema private from public, anon, authenticated;

-- Reserve an attempt before sending, including attempts interrupted by a process crash.
create function public.claim_webhook_delivery(p_id uuid, p_token uuid)
returns setof public.webhook_deliveries language plpgsql security definer set search_path = '' as $$
begin
  update public.webhook_deliveries set status = 'failed', last_error = 'Attempt limit reached after interrupted delivery',
    claimed_until = null, claim_token = null
  where id = p_id and status = 'pending' and attempts >= max_attempts
    and (claimed_until is null or claimed_until < now());
  return query update public.webhook_deliveries set
    attempts = attempts + 1, claimed_until = now() + interval '2 minutes', claim_token = p_token
  where id = p_id and status = 'pending' and attempts < max_attempts
    and (next_retry_at is null or next_retry_at <= now())
    and (claimed_until is null or claimed_until < now()) returning *;
end;
$$;
revoke all on function public.claim_webhook_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_webhook_delivery(uuid, uuid) to service_role;
