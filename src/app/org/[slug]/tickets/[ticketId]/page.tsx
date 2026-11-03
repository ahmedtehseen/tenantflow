import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/data/tenant";
import { TicketDetail } from "./ticket-detail";
import type { MemberOption } from "../_components/ticket-list";
import type { ActivityItem } from "./_components/activity-timeline";

interface TicketDetailPageProps {
  params: Promise<{ slug: string; ticketId: string }>;
}

export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps) {
  const { slug, ticketId } = await params;
  const supabase = await createClient();

  // Instant in-memory cache hit from layout
  const { user, currentOrg: org, currentRole, profile } = await getTenantContext(slug);

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
      .select(`
        user_id,
        profiles (
          id,
          full_name,
          email
        )
      `)
      .eq("organization_id", org.id),
    supabase
      .from("ticket_activities")
      .select(`
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
      `)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false }),
  ]);

  const ticket = ticketResult.data;
  if (!ticket) {
    notFound();
  }

  const membersData = membersResult.data || [];
  const memberMap = new Map<string, { id: string; full_name: string | null; email: string }>();
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
    ? memberMap.get(ticket.created_by) ?? null
    : null;

  const assigneeProfile = ticket.assigned_to
    ? memberMap.get(ticket.assigned_to) ?? null
    : null;

  const activitiesData = (activitiesResult.data as unknown as Array<{
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
    const actor = rawActor || (act.actor_id ? memberMap.get(act.actor_id) : null) || null;
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

  return (
    <TicketDetail
      ticket={ticket}
      creatorProfile={creatorProfile}
      assigneeProfile={assigneeProfile}
      members={memberOptions}
      activities={activities}
      orgId={org.id}
      orgSlug={org.slug}
      callerUserId={user.id}
      callerRole={currentRole}
      callerEmail={user.email || profile?.email || ""}
      callerName={profile?.full_name ?? null}
    />
  );
}
