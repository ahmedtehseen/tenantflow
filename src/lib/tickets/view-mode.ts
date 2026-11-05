export type ViewMode = "list" | "kanban";

/**
 * Resolves a URL parameter string into a valid ViewMode ("list" | "kanban"),
 * defaulting to "list".
 */
export function resolveViewMode(val?: string | null): ViewMode {
  return val === "kanban" ? "kanban" : "list";
}
