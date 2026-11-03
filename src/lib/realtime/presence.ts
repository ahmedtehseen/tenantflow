import type { PresenceUser, OrgRole } from "@/types/database";

/**
 * Formats a user profile into a standard PresenceUser payload for Supabase Presence.
 */
export function formatPresenceUser(params: {
  userId: string;
  email: string;
  fullName: string | null;
  role: OrgRole;
  avatarUrl?: string | null;
  currentView?: "list" | "kanban" | "ticket";
  viewingTicketId?: string | null;
}): PresenceUser {
  return {
    userId: params.userId,
    email: params.email,
    fullName: params.fullName ?? null,
    role: params.role,
    avatarUrl: params.avatarUrl ?? null,
    currentView: params.currentView ?? (params.viewingTicketId ? "ticket" : "kanban"),
    viewingTicketId: params.viewingTicketId ?? null,
    onlineAt: new Date().toISOString(),
  };
}

/**
 * Helper to determine whether a presence entry represents an active ticket view.
 */
function hasActiveTicketView(user: PresenceUser): boolean {
  return Boolean(user.viewingTicketId || user.currentView === "ticket");
}

/**
 * Compares two presence records for the same userId and determines if the candidate
 * should supersede the existing entry.
 *
 * Rules:
 * 1. Active ticket view takes precedence over general board/list browsing.
 * 2. If both or neither have active views, the record with the newer onlineAt timestamp wins.
 */
function shouldReplacePresence(
  existing: PresenceUser,
  candidate: PresenceUser
): boolean {
  const existingActive = hasActiveTicketView(existing);
  const candidateActive = hasActiveTicketView(candidate);

  if (candidateActive && !existingActive) {
    return true;
  }
  if (!candidateActive && existingActive) {
    return false;
  }

  const existingTime = Number.isNaN(Date.parse(existing.onlineAt))
    ? 0
    : Date.parse(existing.onlineAt);
  const candidateTime = Number.isNaN(Date.parse(candidate.onlineAt))
    ? 0
    : Date.parse(candidate.onlineAt);

  return candidateTime >= existingTime;
}

/**
 * Flattens Supabase Presence state, deduplicates multiple tabs per user by userId
 * (preserving active ticket views or latest onlineAt), and sorts alphabetically by name/email.
 */
export function aggregateWorkspacePresence(
  rawState: Record<string, PresenceUser[]>
): PresenceUser[] {
  if (!rawState || typeof rawState !== "object") {
    return [];
  }

  const usersById = new Map<string, PresenceUser>();

  for (const presenceList of Object.values(rawState)) {
    if (!Array.isArray(presenceList)) {
      continue;
    }

    for (const user of presenceList) {
      if (!user || !user.userId) {
        continue;
      }

      const existing = usersById.get(user.userId);
      if (!existing || shouldReplacePresence(existing, user)) {
        usersById.set(user.userId, user);
      }
    }
  }

  return Array.from(usersById.values()).sort((a, b) => {
    const nameA = a.fullName?.trim() || a.email || "";
    const nameB = b.fullName?.trim() || b.email || "";
    const cmp = nameA.localeCompare(nameB);
    if (cmp !== 0) return cmp;
    return a.userId.localeCompare(b.userId);
  });
}

/**
 * Filters the list of present workspace users down to only those actively inspecting a specific ticket.
 */
export function filterTicketViewers(
  allPresentUsers: PresenceUser[],
  ticketId: string
): PresenceUser[] {
  if (!Array.isArray(allPresentUsers) || !ticketId) {
    return [];
  }

  return allPresentUsers.filter((u) => Boolean(u) && u.viewingTicketId === ticketId);
}
