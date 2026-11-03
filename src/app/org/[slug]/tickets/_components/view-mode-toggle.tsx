"use client";

import { Suspense, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { List, LayoutGrid } from "lucide-react";

export type ViewMode = "list" | "kanban";

/**
 * Resolves a URL parameter string into a valid ViewMode ("list" | "kanban"),
 * defaulting to "list".
 */
export function resolveViewMode(val?: string | null): ViewMode {
  return val === "kanban" ? "kanban" : "list";
}

export interface ViewModeToggleProps {
  currentView?: ViewMode;
  onViewChange?: (view: ViewMode) => void;
  className?: string;
}

function ViewModeToggleInner({
  currentView: controlledView,
  onViewChange,
  className = "",
}: ViewModeToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlView = resolveViewMode(searchParams?.get("view"));
  const activeView = controlledView ?? urlView;

  const handleSelectView = useCallback(
    (nextView: ViewMode) => {
      if (nextView === activeView) return;

      onViewChange?.(nextView);

      const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
      if (nextView === "kanban") {
        params.set("view", "kanban");
      } else {
        params.set("view", "list");
      }

      const queryString = params.toString();
      const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(targetUrl, { scroll: false });
    },
    [activeView, onViewChange, searchParams, pathname, router],
  );

  return (
    <div
      role="group"
      aria-label="View mode toggle"
      className={`inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-950/80 ${className}`}
    >
      <button
        type="button"
        onClick={() => handleSelectView("list")}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
          activeView === "list"
            ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
        aria-pressed={activeView === "list"}
        title="List view"
      >
        <List className="size-3.5" />
        <span>List</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelectView("kanban")}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
          activeView === "kanban"
            ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
        aria-pressed={activeView === "kanban"}
        title="Board view"
      >
        <LayoutGrid className="size-3.5" />
        <span>Board</span>
      </button>
    </div>
  );
}

export function ViewModeToggle(props: ViewModeToggleProps) {
  return (
    <Suspense
      fallback={
        <div className="inline-flex h-8 w-[130px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      }
    >
      <ViewModeToggleInner {...props} />
    </Suspense>
  );
}
