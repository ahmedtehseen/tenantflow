"use client";

import { TicketDetail } from "./ticket-detail";

import { useParams } from "next/navigation";
import { WorkspaceScreen } from "@/components/workspace/workspace-screen";
import type { DetailData } from "@/lib/data/workspace";

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  return (
    <WorkspaceScreen<DetailData> screen={`ticket/${ticketId}`}>
      {({
        org,
        user,
        currentRole,
        profile,
        ticket,
        creatorProfile,
        assigneeProfile,
        memberOptions,
        activities,
      }) => (
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
      )}
    </WorkspaceScreen>
  );
}
