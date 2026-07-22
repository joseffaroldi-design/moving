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

export interface NewLeadInput {
  company_id: string;
  created_by: string;
  customer_id?: string | null;
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

export async function createLead(input: NewLeadInput): Promise<LeadRecord> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(input)
    .select(LEAD_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as LeadRecord;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}
