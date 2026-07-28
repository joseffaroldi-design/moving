import { DashboardShell } from "@/components/data/DashboardShell";
import { getDashboard } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NormalizedDashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialData: NormalizedDashboard | null = null;
  let initialError: string | null = null;

  // Read the caller's authenticated session server-side (cookies) and forward
  // its access token. If there is no token here, we leave both null so the
  // client DashboardProvider can retry with the browser session — we never
  // fall back to an anonymous request.
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      initialData = await getDashboard(token);
    }
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
