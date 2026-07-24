import { getBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Dispatch service — authenticated, RLS-scoped reads (0017a/0017b) + the
// verified assignment RPCs (0017d). Dispatch tables are SELECT-only for
// clients; ALL writes flow through assign_job_to_dispatch / set_job_crew /
// set_job_trucks (SECURITY DEFINER). No direct client writes here.
// ---------------------------------------------------------------------------

export const DISPATCH_ROLES = ["owner", "operations_manager", "dispatcher"];
export function canDispatch(role: string | null | undefined): boolean {
  return !!role && DISPATCH_ROLES.includes(role);
}

export interface TruckRecord {
  id: string;
  name: string;
  license_plate: string | null;
  is_active: boolean;
  [key: string]: unknown;
}

export interface MemberRecord {
  id: string;
  display_name: string;
  role: string | null;
  is_active: boolean;
}

export interface DispatchAssignmentRow {
  id: string;
  company_id: string;
  dispatch_day_id: string;
  job_id: string;
  truck_id: string | null;
  crew_lead_id: string | null;
  status: string;
  start_window: string | null;
  end_window: string | null;
  route_order: number;
  dispatcher_notes: string | null;
  dispatch_days?: { dispatch_date: string } | null;
  trucks?: { id: string; name: string } | null;
  jobs?: { id: string; job_number: string; customer_id: string | null; origin_address: string; destination_address: string; status: string; customers?: { first_name: string; last_name: string } | null } | null;
  [key: string]: unknown;
}

function displayName(p: Record<string, unknown>): string {
  const full = (p.full_name as string) || (p.name as string);
  if (full) return full;
  const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return fl || (p.email as string) || (p.id as string);
}

export async function fetchTrucks(companyId: string): Promise<TruckRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TruckRecord[];
}

// Company profiles for crew selection. Reads only what's needed and derives a
// display name defensively (schema-agnostic).
export async function fetchCompanyMembers(companyId: string): Promise<MemberRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[])
    .map((p) => ({
      id: p.id as string,
      display_name: displayName(p),
      role: (p.role as string) ?? null,
      is_active: (p.is_active as boolean) ?? true,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

const ASSIGNMENT_SELECT =
  "*, dispatch_days!inner(dispatch_date), trucks(id, name), jobs(id, job_number, customer_id, origin_address, destination_address, status, customers(first_name, last_name))";

export async function fetchAssignmentsForDate(
  companyId: string,
  isoDate: string
): Promise<DispatchAssignmentRow[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("dispatch_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("company_id", companyId)
    .eq("dispatch_days.dispatch_date", isoDate)
    .order("route_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DispatchAssignmentRow[];
}

export async function fetchAssignmentForJobDate(
  jobId: string,
  isoDate: string
): Promise<DispatchAssignmentRow | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("dispatch_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("job_id", jobId)
    .eq("dispatch_days.dispatch_date", isoDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as DispatchAssignmentRow | null;
}

export async function fetchJobCrew(jobId: string): Promise<{ profile_id: string; role: string }[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("job_crew")
    .select("profile_id, role")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { profile_id: string; role: string }[];
}

export async function fetchJobTrucks(jobId: string): Promise<{ truck_id: string }[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("job_trucks")
    .select("truck_id")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { truck_id: string }[];
}

// --- RPC wrappers (args mirror 0017d exactly) -----------------------------

export interface AssignJobInput {
  job_id: string;
  dispatch_date: string; // YYYY-MM-DD
  truck_id?: string | null;
  crew_lead_id?: string | null;
  start_window?: string | null; // ISO
  end_window?: string | null; // ISO
  route_order?: number | null;
  dispatcher_notes?: string | null;
}

export async function assignJobToDispatch(input: AssignJobInput) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("assign_job_to_dispatch", {
    p_job_id: input.job_id,
    p_dispatch_date: input.dispatch_date,
    p_truck_id: input.truck_id ?? null,
    p_crew_lead_id: input.crew_lead_id ?? null,
    p_start_window: input.start_window ?? null,
    p_end_window: input.end_window ?? null,
    p_route_order: input.route_order ?? null,
    p_dispatcher_notes: input.dispatcher_notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setJobCrew(jobId: string, members: { profile_id: string; role: string }[]) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("set_job_crew", {
    p_job_id: jobId,
    p_members: members,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setJobTrucks(jobId: string, truckIds: string[]) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("set_job_trucks", {
    p_job_id: jobId,
    p_truck_ids: truckIds,
  });
  if (error) throw new Error(error.message);
  return data;
}
