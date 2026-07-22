"use client";

import { AppShell } from "@/components/shell/AppShell";
import { DashboardProvider } from "@/components/data/DashboardProvider";
import { STAFF_NAV } from "@/lib/nav";
import type { NormalizedDashboard } from "@/lib/types";

export function DashboardShell({
  children,
  initialData,
  initialError,
}: {
  children: React.ReactNode;
  initialData: NormalizedDashboard | null;
  initialError: string | null;
}) {
  return (
    <DashboardProvider initialData={initialData} initialError={initialError}>
      <AppShell nav={STAFF_NAV} section="Operations">
        {children}
      </AppShell>
    </DashboardProvider>
  );
}
