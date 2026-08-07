import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/data/DashboardShell";
import { getDashboard } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NormalizedDashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAFF_ROLES = new Set([
  "owner",
  "operations_manager",
  "dispatcher",
  "sales",
]);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialData: NormalizedDashboard | null = null;
  let initialError: string | null = null;

  // Enforce the staff boundary server-side before rendering any dashboard
  // route. Middleware proves authentication; this gate proves authorization.
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    const role = typeof profile?.role === "string" ? profile.role : null;
    if (!profile || profile.is_active !== true || !role || !STAFF_ROLES.has(role)) {
      if (role === "mover" || role === "crew_lead") redirect("/mobile/jobs");
      if (role === "customer") redirect("/portal");
      redirect("/unauthorized");
    }
  }

  // Read the caller's authenticated session server-side (cookies) and forward
  // its access token. If there is no token here, we leave both null so the
  // client DashboardProvider can retry with the browser session — we never
  // fall back to an anonymous request.
  try {
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
