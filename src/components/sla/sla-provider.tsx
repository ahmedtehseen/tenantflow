"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { OrganizationSLAPolicy } from "@/types/database";

const SLAContext = createContext<{
  policy: OrganizationSLAPolicy | null;
  now: number | null;
}>({ policy: null, now: null });

export function SLAProvider({
  policy,
  children,
}: {
  policy: OrganizationSLAPolicy | null;
  children: React.ReactNode;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);
  return (
    <SLAContext.Provider value={{ policy, now }}>
      {children}
    </SLAContext.Provider>
  );
}

export const useSLAClock = () => useContext(SLAContext);
