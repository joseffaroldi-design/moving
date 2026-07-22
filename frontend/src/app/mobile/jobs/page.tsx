import { DashboardProvider } from "@/components/data/DashboardProvider";
import { getDashboard } from "@/lib/api";
import type { NormalizedDashboard } from "@/lib/types";
import { JobsClient } from "./JobsClient";

export const dynamic = "force-dynamic";

export default async function MobileJobsPage() {
  let data: NormalizedDashboard | null = null;
  let err: string | null = null;
  try {
    data = await getDashboard();
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load.";
  }
  return (
    <DashboardProvider initialData={data} initialError={err}>
      <JobsClient />
    </DashboardProvider>
  );
}
