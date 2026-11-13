"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { useWorkspace, useRefreshWorkspace } from "./workspace-provider";

class ScreenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function fetchScreen(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ScreenError(
      body?.error || "Unable to refresh this screen. Try again.",
      response.status,
    );
  }
  return response.json();
}

export function WorkspaceScreen<Data>({
  screen,
  children,
}: {
  screen: string;
  children: (data: Data) => React.ReactNode;
}) {
  const { userId, orgId, slug, state } = useWorkspace();
  const pathname = usePathname();
  const { unload } = useSWRConfig();
  const refresh = useRefreshWorkspace();
  const url = `/org/${encodeURIComponent(slug)}/data/${screen}?user=${encodeURIComponent(userId)}&org=${encodeURIComponent(orgId)}`;
  const { data, error } = useSWR<Data, ScreenError>(url, fetchScreen);
  const usable = data !== undefined && error?.status !== 410;

  useEffect(() => {
    // Activity resumes effects. Force catch-up even inside SWR's deduplication window.
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (error && [401, 403, 404].includes(error.status)) {
      state.clear();
      unload({ revalidate: false });
      // Reload through the server's tenant authorization and access-denied flow.
      window.location.assign(
        error.status === 401
          ? `/login?next=${encodeURIComponent(pathname)}`
          : pathname,
      );
    }
  }, [error, state, unload, pathname]);

  useEffect(() => {
    if (!usable) return;
    const key = `${pathname}:scroll`;
    const saved = state.get(key);
    let restored = false;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (typeof saved === "number") window.scrollTo(0, saved);
        restored = true;
      });
    });
    const save = () => {
      if (restored && window.location.pathname === pathname)
        state.set(key, window.scrollY);
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
    };
  }, [usable, pathname, state]);

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>{error.message}</span>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="rounded-lg border px-3 py-1.5 font-medium"
          >
            Retry
          </button>
        </div>
      )}
      {usable
        ? children(data!)
        : !error && (
            <div
              role="status"
              aria-label="Loading screen"
              className="space-y-4 animate-pulse"
            >
              <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
              <span className="sr-only">Loading screen</span>
            </div>
          )}
    </>
  );
}
