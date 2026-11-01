import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TicketDetail } from "./ticket-detail";
import type { MemberOption } from "../_components/ticket-list";
import type { OrgRole } from "@/types/database";

interface TicketDetailPageProps {
  params: Promise<{ slug: string; ticketId: string }>;
}

export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps) {
  const { slug, ticketId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/org/${slug}/tickets/${ticketId}`);
  }

  // 1. Fetch organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    notFound();
  }

  // 2. Fetch caller membership
  const { data: callerMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!callerMember) {
    notFound();
  }

  // 3. Fetch ticket
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!ticket) {
    notFound();
  }

  // 4. Fetch organization members
  const { data: membersData } = await supabase
    .from("organization_members")
    .select(`
      user_id,
      profiles (
        id,
        full_name,
        email
      )
    `)
    .eq("organization_id", org.id);

  const memberMap = new Map<string, { id: string; full_name: string | null; email: string }>();
  const memberOptions: MemberOption[] = [];

  (membersData || []).forEach((m) => {
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
      callerRole={callerMember.role as OrgRole}
    />
  );
}

