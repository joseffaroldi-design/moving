import { getBrowserClient } from "@/lib/supabase/client";

export interface LeadNote {
  id: string;
  lead_id: string;
  company_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export async function fetchLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeadNote[];
}

export async function addLeadNote(input: {
  lead_id: string;
  company_id: string;
  author_id: string;
  body: string;
}): Promise<LeadNote> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.from("lead_notes").insert(input).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as LeadNote;
}
