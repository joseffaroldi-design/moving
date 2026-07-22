import { DashboardShell } from "@/components/data/DashboardShell";
import { getDashboard } from "@/lib/api";
import type { NormalizedDashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialData: NormalizedDashboard | null = null;
  let initialError: string | null = null;
  try {
    initialData = await getDashboard();
  } catch (e) {
    initialError =
      e instanceof Error ? e.message : "Failed to load dashboard data.";
  }

  return (
    <DashboardShell initialData={initialData} initialError={initialError}>
      {children}
    </DashboardShell>
  );
}
