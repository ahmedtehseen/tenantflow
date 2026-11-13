import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/data/tenant";
import type {
  MemberOption,
  TicketItem,
} from "@/app/org/[slug]/tickets/_components/ticket-list";
import type { ActivityItem } from "@/app/org/[slug]/tickets/[ticketId]/_components/activity-timeline";
import type { InvitationRole } from "@/types/database";

export async function loadOverview(context: TenantContext) {
  const { currentOrg: org } = context;
  const supabase = await createClient();
  // Parallel database queries for dashboard metrics
  const [membersResult, ticketsCountResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role, created_at, profiles(id, full_name, email)", {
        count: "exact",
      })
      .eq("organization_id", org.id)
      .order("created_at", { ascending: true })
      .limit(5),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id),
  ]);
  if (membersResult.error || ticketsCountResult.error)
    throw new Error("Unable to load workspace data.");

  const members = membersResult.data || [];
  const memberCount = membersResult.count ?? 0;
  const ticketCount = ticketsCountResult.count ?? 0;

  return { org, members, memberCount, ticketCount };
}

export async function loadTickets(context: TenantContext) {
  const { user, currentOrg: org, currentRole, profile } = context;
  const supabase = await createClient();
  // Parallel database queries for members & tickets
  const [membersResult, ticketsResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        `
        user_id,
        profiles (
          id,
          full_name,
          email
        )
      `,
      )
      .eq("organization_id", org.id),
    supabase
      .from("tickets")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
  ]);
  if (membersResult.error || ticketsResult.error)
    throw new Error("Unable to load workspace data.");

  const membersData = membersResult.data || [];
  const rawTickets = ticketsResult.data || [];

  const memberMap = new Map<
    string,
    { id: string; full_name: string | null; email: string }
  >();
  const memberOptions: MemberOption[] = [];

  membersData.forEach((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p) {
      memberMap.set(m.user_id, {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
      });
      memberOptions.push({
        user_id: m.user_id,
        full_name: p.full_name,
        email: p.email,
      });
    }
  });

  const tickets: TicketItem[] = rawTickets.map((t) => ({
    ...t,
    creator: t.created_by ? (memberMap.get(t.created_by) ?? null) : null,
    assignee: t.assigned_to ? (memberMap.get(t.assigned_to) ?? null) : null,
  }));

  return { org, user, currentRole, profile, tickets, memberOptions };
}

export async function loadMembers(context: TenantContext) {
  const { user, currentOrg: org, currentRole } = context;
  const supabase = await createClient();
  const canManageMembers = currentRole === "owner" || currentRole === "admin";
  const nowIso = new Date().toISOString();

  // Fetch active members and pending invitations in parallel (ADR 0002)
  const [
    { data: members, error: membersError },
    { data: invitations, error: invitationsError },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        `
        user_id,
        role,
        created_at,
        profiles (
          id,
          email,
          full_name,
          avatar_url
        )
      `,
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: true }),

    canManageMembers
      ? supabase
          .from("organization_invitations")
          .select(
            `
            id,
            email,
            role,
            token,
            created_at,
            expires_at
          `,
          )
          .eq("organization_id", org.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersError || invitationsError)
    throw new Error("Unable to load members.");

  const typedInvitations = (invitations ?? []).map((inv) => ({
    ...inv,
    role: inv.role as InvitationRole,
  }));

  return {
    org,
    user,
    currentRole,
    canManageMembers,
    typedInvitations,
    members: members ?? [],
  };
}

export async function loadSettings(context: TenantContext) {
  const { currentOrg: org, currentRole } = context;
  const client = await createClient();
  const canManage = currentRole === "owner" || currentRole === "admin";
  const [policy, webhooks, deliveries] = await Promise.all([
    client
      .from("organization_sla_policies")
      .select("*")
      .eq("organization_id", org.id)
      .maybeSingle(),
    canManage
      ? client
          .from("organization_webhooks")
          .select("*")
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canManage
      ? client
          .from("webhook_deliveries")
          .select("*")
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (policy.error || webhooks.error || deliveries.error)
    throw new Error("Unable to load workspace settings.");

  return {
    org,
    currentRole,
    canManage,
    policy: policy.data,
    webhooks: webhooks.data || [],
    deliveries: deliveries.data || [],
  };
}

export async function loadDetail(context: TenantContext, ticketId: string) {
  const { user, currentOrg: org, currentRole, profile } = context;
  const supabase = await createClient();
  // Parallel fetch: ticket, organization members, and ticket activities
  const [ticketResult, membersResult, activitiesResult] = await Promise.all([
    supabase
      .from("tickets")
      .select("*")
      .eq("id", ticketId)
      .eq("organization_id", org.id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select(
        `
        user_id,
        profiles (
          id,
          full_name,
          email
        )
      `,
      )
      .eq("organization_id", org.id),
    supabase
      .from("ticket_activities")
      .select(
        `
        id,
        ticket_id,
        organization_id,
        actor_id,
        activity_type,
        old_value,
        new_value,
        metadata,
        created_at,
        actor:profiles!ticket_activities_actor_id_fkey(id, full_name, email)
      `,
      )
      .eq("ticket_id", ticketId)
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
  ]);
  if (ticketResult.error || membersResult.error || activitiesResult.error)
    throw new Error("Unable to load workspace data.");

  const ticket = ticketResult.data;
  if (!ticket) {
    return null;
  }

  const membersData = membersResult.data || [];
  const memberMap = new Map<
    string,
    { id: string; full_name: string | null; email: string }
  >();
  const memberOptions: MemberOption[] = [];

  membersData.forEach((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (profile) {
      const info = {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      };
      memberMap.set(m.user_id, info);
      memberOptions.push({
        user_id: m.user_id,
        full_name: profile.full_name,
        email: profile.email,
      });
    }
  });

  const creatorProfile = ticket.created_by
    ? (memberMap.get(ticket.created_by) ?? null)
    : null;

  const assigneeProfile = ticket.assigned_to
    ? (memberMap.get(ticket.assigned_to) ?? null)
    : null;

  const activitiesData =
    (activitiesResult.data as unknown as Array<{
      id: string;
      ticket_id: string;
      organization_id: string;
      actor_id: string | null;
      activity_type: ActivityItem["activity_type"];
      old_value: string | null;
      new_value: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
      actor?:
        | { id: string; full_name: string | null; email: string }
        | Array<{ id: string; full_name: string | null; email: string }>
        | null;
    }>) || [];

  const activities: ActivityItem[] = activitiesData.map((act) => {
    const rawActor = Array.isArray(act.actor) ? act.actor[0] : act.actor;
    const actor =
      rawActor || (act.actor_id ? memberMap.get(act.actor_id) : null) || null;
    return {
      id: act.id,
      ticket_id: act.ticket_id,
      organization_id: act.organization_id,
      actor_id: act.actor_id,
      activity_type: act.activity_type,
      old_value: act.old_value,
      new_value: act.new_value,
      metadata: (act.metadata || {}) as Record<string, unknown>,
      created_at: act.created_at,
      actor: actor
        ? {
            id: actor.id,
            full_name: actor.full_name,
            email: actor.email,
          }
        : null,
    };
  });

  return {
    org,
    user,
    currentRole,
    profile,
    ticket,
    creatorProfile,
    assigneeProfile,
    memberOptions,
    activities,
  };
}

export type OverviewData = NonNullable<
  Awaited<ReturnType<typeof loadOverview>>
>;

export type TicketsData = NonNullable<Awaited<ReturnType<typeof loadTickets>>>;

export type MembersData = NonNullable<Awaited<ReturnType<typeof loadMembers>>>;

export type SettingsData = NonNullable<
  Awaited<ReturnType<typeof loadSettings>>
>;

export type DetailData = NonNullable<Awaited<ReturnType<typeof loadDetail>>>;

export type WorkspaceData = OverviewData | TicketsData | MembersData | SettingsData | DetailData;
