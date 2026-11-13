"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import {
  resolvePreferredView,
  viewPreferenceKey,
  type ViewMode,
} from "@/lib/tickets/view-mode";

export function useTicketView(
  fallback: ViewMode = "list",
): [ViewMode, (view: ViewMode) => void] {
  const { userId, orgId, state } = useWorkspace();
  const params = useSearchParams();
  const urlView = params.get("view");
  const key = viewPreferenceKey(userId, orgId);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribe = state.subscribe(listener);
      window.addEventListener("storage", listener);
      return () => {
        unsubscribe();
        window.removeEventListener("storage", listener);
      };
    },
    [state],
  );
  const getSnapshot = useCallback(() => {
    let saved = state.get(key) as string | undefined;
    if (!saved) {
      try {
        saved = localStorage.getItem(key) ?? undefined;
      } catch {
        /* Storage can be disabled. */
      }
    }
    return resolvePreferredView(urlView, saved ?? fallback);
  }, [state, key, urlView, fallback]);
  const view = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const setView = useCallback(
    (next: ViewMode) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* Keep the preference for this session. */
      }
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.pathname + url.search);
      state.set(key, next);
    },
    [state, key],
  );
  return [view, setView];
}
