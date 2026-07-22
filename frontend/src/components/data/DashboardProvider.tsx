"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getDashboard } from "@/lib/api";
import type { NormalizedDashboard } from "@/lib/types";

interface DashboardCtx {
  data: NormalizedDashboard | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const Ctx = createContext<DashboardCtx | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<NormalizedDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getDashboard()
      .then((d) => setData(d))
      .catch((e) => setError(e?.message ?? "Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Ctx.Provider value={{ data, loading, error, refetch: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useDashboardData must be used within DashboardProvider");
  return ctx;
}
