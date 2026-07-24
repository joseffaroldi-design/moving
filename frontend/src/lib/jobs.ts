import { getBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Jobs service — authenticated, RLS-scoped reads (migration 0016a) + the
// verified quote->job conversion RPC (migration 0016b). Job tables are
// locked down: authenticated has SELECT only, all writes flow through the
// SECURITY DEFINER convert_quote_to_job RPC. No direct client writes here.
// ---------------------------------------------------------------------------

export const JOB_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type JobStatus = string;

export function jobStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (!s) return "—";
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface JobCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface JobRecord {
  id: string;
  company_id: string;
  quote_id: string | null;
  customer_id: string | null;
  status: string;
  job_number: string;
  scheduled_start: string;
  scheduled_end: string | null;
  origin_address: string;
  destination_address: string;
  crew_size: number | null;
  truck_count: number | null;
  dispatch_notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: JobCustomer | null;
  [key: string]: unknown;
}

const JOB_SELECT = "*, customers(id, first_name, last_name, email, phone)";

export async function fetchJobs(companyId: string): Promise<JobRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("company_id", companyId)
    .order("scheduled_start", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as JobRecord[];
}

// ---------------------------------------------------------------------------
// Conversion RPC wrapper — args mirror migration 0016b EXACTLY.
// Idempotent server-side: if the quote already has a job, the RPC returns the
// existing {job_id, job_number} with created=false (no error).
// ---------------------------------------------------------------------------
export interface ConvertQuoteToJobInput {
  quote_id: string;
  scheduled_start: string; // ISO timestamp
  origin_address: string;
  destination_address: string;
  scheduled_end?: string | null; // ISO timestamp
  crew_size?: number | null;
  truck_count?: number | null;
  dispatch_notes?: string | null;
}

export interface ConvertQuoteToJobResult {
  job_id: string;
  job_number: string;
  quote_id: string;
  created: boolean;
}

export async function convertQuoteToJob(
  input: ConvertQuoteToJobInput
): Promise<ConvertQuoteToJobResult> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("convert_quote_to_job", {
    p_quote_id: input.quote_id,
    p_scheduled_start: input.scheduled_start,
    p_origin_address: input.origin_address,
    p_destination_address: input.destination_address,
    p_scheduled_end: input.scheduled_end ?? null,
    p_crew_size: input.crew_size ?? null,
    p_truck_count: input.truck_count ?? null,
    p_dispatch_notes: input.dispatch_notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ConvertQuoteToJobResult;
}
