import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/data/tenant";
import { TicketDetail } from "./ticket-detail";
import type { MemberOption } from "../_components/ticket-list";

interface TicketDetailPageProps {
  params: Promise<{ slug: string; ticketId: string }>;
}

export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps) {
  const { slug, ticketId } = await params;
  const supabase = await createClient();

  // Instant in-memory cache hit from layout
  const { user, currentOrg: org, currentRole } = await getTenantContext(slug);

  // Parallel fetch: ticket and organization members
  const [ticketResult, membersResult] = await Promise.all([
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

  return (
    <TicketDetail
      ticket={ticket}
      creatorProfile={creatorProfile}
      assigneeProfile={assigneeProfile}
      members={memberOptions}
      orgId={org.id}
      orgSlug={org.slug}
      callerUserId={user.id}
      callerRole={currentRole}
    />
  );
}
