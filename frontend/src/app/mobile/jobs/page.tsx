import { DashboardProvider } from "@/components/data/DashboardProvider";
import { getDashboard } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NormalizedDashboard } from "@/lib/types";
import { JobsClient } from "./JobsClient";

export const dynamic = "force-dynamic";

export default async function MobileJobsPage() {
  let data: NormalizedDashboard | null = null;
  let err: string | null = null;

  // Forward the authenticated session token (cookies). No anonymous fallback:
  // if no token is present here, the client provider retries with the browser
  // session.
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      data = await getDashboard(token);
    }
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load.";
  }

  return (
    <DashboardProvider initialData={data} initialError={err}>
      <JobsClient />
    </DashboardProvider>
  );
}
