import { getBrowserClient } from "@/lib/supabase/client";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "booked",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface LeadRecord {
  id: string;
  company_id: string;
  customer_id: string | null;
  status: LeadStatus;
  source: string | null;
  move_date: string | null;
  origin_address: string | null;
  destination_address: string | null;
  bedrooms: number | null;
  estimated_volume_cuft: number | null;
  notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: LeadCustomer | null;
  [key: string]: unknown;
}

export interface NewLeadWithCustomerInput {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  move_date?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  bedrooms?: number | null;
  estimated_volume_cuft?: number | null;
  notes?: string | null;
}

const LEAD_SELECT = "*, customers(id, first_name, last_name, email, phone)";

export async function fetchLeads(companyId: string): Promise<LeadRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeadRecord[];
}

// Atomic: customer + lead created in a single DB transaction via SECURITY
// DEFINER RPC. company_id and created_by are derived server-side from the
// caller's session; status is hardcoded to 'new'. Returns both new IDs.
export async function createLeadWithCustomer(
  input: NewLeadWithCustomerInput
): Promise<{ customer_id: string; lead_id: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("create_lead_with_customer", {
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_source: input.source ?? null,
    p_move_date: input.move_date ?? null,
    p_origin_address: input.origin_address ?? null,
    p_destination_address: input.destination_address ?? null,
    p_bedrooms: input.bedrooms ?? null,
    p_estimated_volume_cuft: input.estimated_volume_cuft ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { customer_id: string; lead_id: string };
}

// Single lead read (used for prefilling the Schedule Job form from a quote's
// linked lead). RLS-scoped; returns null if not visible/found.
export async function fetchLeadById(id: string): Promise<LeadRecord | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as LeadRecord | null;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}
