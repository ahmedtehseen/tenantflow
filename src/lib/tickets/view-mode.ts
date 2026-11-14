export type ViewMode = "list" | "kanban";

/**
 * Resolves a URL parameter string into a valid ViewMode ("list" | "kanban"),
 * defaulting to "list".
 */
export function resolveViewMode(val?: string | null): ViewMode {
  return val === "kanban" ? "kanban" : "list";
}

export function viewPreferenceKey(userId: string, orgId: string): string {
  return `tenantflow:${userId}:${orgId}:tickets:view`;
}

export function resolvePreferredView(
  urlView: string | null,
  savedView: string | null,
): ViewMode {
  if (urlView === "list" || urlView === "kanban") return urlView;
  return resolveViewMode(savedView);
}
