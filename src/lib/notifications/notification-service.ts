import type { Notification } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getNotificationInbox(
  client: SupabaseClient,
  orgId: string,
  userId: string,
) {
  const [recent, unread] = await Promise.all([
    client
      .from("notifications")
      .select("*")
      .eq("organization_id", orgId)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30),
    client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("recipient_id", userId)
      .is("read_at", null),
  ]);
  if (recent.error || unread.error)
    throw new Error("Unable to load notifications.");
  return {
    items: (recent.data || []) as Notification[],
    unread: unread.count || 0,
  };
}
