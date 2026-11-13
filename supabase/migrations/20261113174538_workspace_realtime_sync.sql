-- Workspace-wide invalidation hints use private tenant topics. Payloads contain
-- the changed table name so every receiver reloads through authorized reads.

create policy workspace_members_receive_changes
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and topic = (select realtime.topic())
  and topic in (
    select 'workspace:' || organization_id::text
    from public.get_auth_user_org_ids() as organization_id
  )
);

create or replace function public.notify_workspace_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
  organization_id uuid;
begin
  if TG_OP = 'DELETE' then
    changed_row := to_jsonb(OLD);
  else
    changed_row := to_jsonb(NEW);
  end if;

  if TG_TABLE_NAME = 'organizations' then
    organization_id := (changed_row ->> 'id')::uuid;
  else
    organization_id := (changed_row ->> 'organization_id')::uuid;
  end if;

  perform realtime.send(
    jsonb_build_object('table', TG_TABLE_NAME),
    'workspace_changed',
    'workspace:' || organization_id::text,
    true
  );
  return null;
end;
$$;

revoke all on function public.notify_workspace_changed() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'organization_members', 'organization_invitations',
    'organization_sla_policies', 'organization_webhooks', 'webhook_deliveries',
    'tickets', 'ticket_activities'
  ] loop
    execute format(
      'create trigger workspace_realtime_changed after insert or update or delete on public.%I for each row execute function public.notify_workspace_changed()',
      table_name
    );
  end loop;
end;
$$;
