"use server";

import { scheduleWebhookDispatch } from "@/lib/webhooks/schedule";
import { getTenantContext, assertTenantScoping } from "@/lib/data/tenant";
import { createClient } from "@/lib/supabase/server";

export async function saveCommentAction(
  orgSlug: string,
  orgId: string,
  ticketId: string,
  commentId: string | null,
  content: string,
) {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);
  if (!context.currentRole)
    return { error: "Workspace membership is required." };
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.length > 10000
  ) {
    return { error: "Comments must contain between 1 and 10,000 characters." };
  }
  const supabase = await createClient();
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (ticketError || !ticket) return { error: "Ticket unavailable." };

  const query = commentId
    ? supabase
        .from("ticket_comments")
        .update({
          content: content.trim(),
          is_edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq("id", commentId)
        .eq("ticket_id", ticketId)
        .eq("organization_id", orgId)
        .eq("author_id", context.user.id)
    : supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        organization_id: orgId,
        author_id: context.user.id,
        content: content.trim(),
      });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data)
    return { error: "Unable to save comment. You can edit your own comments." };
  scheduleWebhookDispatch(orgId);
  return { success: true };
}

export async function deleteCommentAction(
  orgSlug: string,
  orgId: string,
  ticketId: string,
  commentId: string,
) {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);
  if (!context.currentRole)
    return { error: "Workspace membership is required." };
  const supabase = await createClient();
  let query = supabase
    .from("ticket_comments")
    .delete()
    .eq("id", commentId)
    .eq("ticket_id", ticketId)
    .eq("organization_id", orgId);
  if (context.currentRole === "member")
    query = query.eq("author_id", context.user.id);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { error: "Unable to delete comment." };
  return { success: true };
}
