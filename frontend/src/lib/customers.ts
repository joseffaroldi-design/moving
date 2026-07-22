import { getBrowserClient } from "@/lib/supabase/client";

export interface CustomerRecord {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CustomerInput {
  company_id: string;
  created_by?: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  billing_address_line1?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postal_code?: string | null;
  notes?: string | null;
}

export async function fetchCustomers(companyId: string): Promise<CustomerRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CustomerRecord[];
}

export async function createCustomer(input: CustomerInput): Promise<CustomerRecord> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.from("customers").insert(input).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as CustomerRecord;
}

export async function updateCustomer(
  id: string,
  patch: Partial<CustomerInput>
): Promise<CustomerRecord> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as CustomerRecord;
}
