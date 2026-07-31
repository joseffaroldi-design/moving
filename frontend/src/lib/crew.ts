import { getBrowserClient } from "@/lib/supabase/client";
import { isNotCrewError, crewErrorMessage, crewRoleLabel } from "@/lib/crewLogic";

// ---------------------------------------------------------------------------
// Crew-mobile service layer — Phase 9 P2 Slice 1 (migration 0027).
//
// STRICT BOUNDARY: crew never read jobs/job_crew/customers directly (staff-only
// RLS). Every read flows through the two authenticated SECURITY DEFINER RPCs
// below, which return an explicit, whitelisted set of crew-safe fields for the
// caller's OWN assigned jobs. Identity is resolved server-side from auth.uid().
// ---------------------------------------------------------------------------

export { isNotCrewError, crewErrorMessage, crewRoleLabel };
export { jobStatusLabel } from "@/lib/jobs";

export type CrewScope = "active" | "completed" | "all";

export interface CrewJobListItem {
  id: string;
  job_number: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  origin_address: string | null;
  destination_address: string | null;
  crew_size: number | null;
  truck_count: number | null;
  dispatch_notes: string | null;
  my_role: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

export interface CrewRosterMember {
  profile_id: string;
  role: string;
  name: string | null;
  is_me: boolean;
}

export interface CrewJobDetail extends CrewJobListItem {
  crew: CrewRosterMember[];
}

export interface CrewListResponse {
  items: CrewJobListItem[];
  count: number;
  scope: CrewScope;
  limit: number;
  offset: number;
}

export async function crewListJobs(
  scope: CrewScope = "active",
  limit = 50,
  offset = 0
): Promise<CrewListResponse> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_list_jobs", {
    p_scope: scope,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return data as CrewListResponse;
}

export async function crewGetJob(jobId: string): Promise<CrewJobDetail> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_get_job", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return data as CrewJobDetail;
}
