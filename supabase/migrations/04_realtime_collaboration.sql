-- =============================================================================
-- TenantFlow: 04_realtime_collaboration
-- Add tickets and ticket_activities to supabase_realtime publication
-- and set replica identity to FULL for comprehensive old/new change records.
-- =============================================================================

alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_activities;

alter table public.tickets replica identity full;
alter table public.ticket_activities replica identity full;
