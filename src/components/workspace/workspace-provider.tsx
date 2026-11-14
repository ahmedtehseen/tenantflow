"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Dispatch, SetStateAction } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { useRouter, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ScreenState } from "@/lib/workspace/screen-state";

interface WorkspaceScope {
  userId: string;
  orgId: string;
  slug: string;
  state: ScreenState;
}
const WorkspaceContext = createContext<WorkspaceScope | null>(null);

export function useWorkspace() {
  const scope = useContext(WorkspaceContext);
  if (!scope) throw new Error("WorkspaceProvider is required.");
  return scope;
}

export function WorkspaceProvider({
  userId,
  orgId,
  slug,
  children,
}: Omit<WorkspaceScope, "state"> & { children: React.ReactNode }) {
  const [state] = useState(() => new ScreenState());
  const [config] = useState(() => ({
    provider: () => new Map(),
    revalidateOnMount: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  }));
  return (
    <SWRConfig value={config}>
      <WorkspaceContext.Provider value={{ userId, orgId, slug, state }}>
        <WorkspaceSync />
        {children}
      </WorkspaceContext.Provider>
    </SWRConfig>
  );
}

export function useRefreshWorkspace() {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  // Omitting the data argument retains each snapshot while revalidating it.
  return useCallback(() => {
    if (navigator.onLine !== false) router.refresh();
    return mutate(() => true).catch(() => undefined);
  }, [mutate, router]);
}

/** Revalidate after every mutation, including redirects and ambiguous network failures. */
export function useWorkspaceMutation<
  Args extends unknown[],
  Result extends { error?: string | null },
>(action: (...args: Args) => Promise<Result>) {
  const refresh = useRefreshWorkspace();
  return async (...args: Args): Promise<Result> => {
    try {
      return await action(...args);
    } catch (error) {
      unstable_rethrow(error);
      return {
        error: "Unable to confirm changes. Check this screen and try again.",
      } as Result;
    } finally {
      await refresh();
    }
  };
}

export function useWorkspaceState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { state } = useWorkspace();
  const initialRef = useRef(initial);
  const getSnapshot = useCallback(() => {
    const value = state.get(key);
    return value === undefined ? initialRef.current : (value as T);
  }, [state, key]);
  const value = useSyncExternalStore(
    state.subscribe,
    getSnapshot,
    () => initialRef.current,
  );
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const previous = state.get(key) as T | undefined;
      state.set(
        key,
        typeof next === "function"
          ? (next as (current: T) => T)(
              previous === undefined ? initialRef.current : previous,
            )
          : next,
      );
    },
    [state, key],
  );
  return [value, setValue];
}

function WorkspaceSync() {
  const { orgId, userId, state } = useWorkspace();
  const refresh = useRefreshWorkspace();
  const { unload } = useSWRConfig();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh();
      }, 100);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    window.addEventListener("online", scheduleRefresh);
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", onVisible);
    const channel = supabase.channel(`workspace:${orgId}`, {
      config: { private: true },
    });
    channel.on("broadcast", { event: "workspace_changed" }, scheduleRefresh);
    let disposed = false;
    async function subscribe() {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") scheduleRefresh();
      });
    }
    // Focus, navigation, and reconnect continue to check authoritative data.
    void subscribe().catch(scheduleRefresh);

    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId)) {
        state.clear();
        unload({ revalidate: false });
        // A document navigation also clears React Activity and browser memory on sign-out.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("online", scheduleRefresh);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", onVisible);
      auth.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [orgId, userId, state, refresh, unload]);
  return null;
}

/** Untouched fields follow the server. Edited fields retain their original baseline. */
export function useWorkspaceDraft<T>(
  key: string,
  serverValue: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [draft, setDraft] = useWorkspaceState<{ base: T; value: T } | null>(
    key,
    null,
  );
  const value =
    draft && !Object.is(draft.base, draft.value) ? draft.value : serverValue;
  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    setDraft({
      base: serverValue,
      value:
        typeof next === "function" ? (next as (previous: T) => T)(value) : next,
    });
  };
  return [value, setValue, () => setDraft(null)];
}
