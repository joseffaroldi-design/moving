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
  // route. getUser() revalidates the identity with Supabase and is the
  // authoritative server-side auth check used by this repository.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const role = typeof profile?.role === "string" ? profile.role : null;
  if (!profile || profile.is_active !== true || !role || !STAFF_ROLES.has(role)) {
    if (role === "mover" || role === "crew_lead") redirect("/mobile/jobs");
    if (role === "customer") redirect("/portal");
    redirect("/unauthorized");
  }

  // Read the authenticated session only to forward its access token to the
  // dashboard API. Authorization above does not rely on getSession().
  try {
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
