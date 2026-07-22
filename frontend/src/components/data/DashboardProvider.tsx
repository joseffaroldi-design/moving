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

export function DashboardProvider({
  children,
  initialData = null,
  initialError = null,
  autoFetch = true,
}: {
  children: React.ReactNode;
  initialData?: NormalizedDashboard | null;
  initialError?: string | null;
  autoFetch?: boolean;
}) {
  const [data, setData] = useState<NormalizedDashboard | null>(initialData);
  const [loading, setLoading] = useState(!initialData && !initialError && autoFetch);
  const [error, setError] = useState<string | null>(initialError);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getDashboard()
      .then((d) => setData(d))
      .catch((e) => setError(e?.message ?? "Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Only fetch on the client if the server didn't already provide data.
    if (!initialData && !initialError && autoFetch) load();
  }, [initialData, initialError, autoFetch, load]);

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
