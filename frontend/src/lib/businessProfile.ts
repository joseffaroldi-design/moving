import { getBrowserClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

export interface BusinessProfile {
  id?: string;
  business_name: string;
  logo_url?: string | null;
  phone: string;
  email: string;
  address?: string | null;
  website?: string | null;
  tagline_primary: string;
  tagline_secondary: string;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_cream_color?: string | null;
  quote_terms?: string | null;
  invoice_terms?: string | null;
  default_tax_rate?: number | null;
  default_deposit_percentage?: number | null;
  cancellation_policy?: string | null;
  payment_instructions?: string | null;
}

export const FALLBACK_PROFILE: BusinessProfile = {
  business_name: BRAND.name,
  phone: BRAND.phone,
  email: BRAND.email,
  tagline_primary: BRAND.taglinePrimary,
  tagline_secondary: BRAND.taglineSecondary,
  brand_primary_color: "#0E2A4A",
  brand_secondary_color: "#C89A3D",
  brand_cream_color: "#F7F0DF",
  default_tax_rate: 0,
  default_deposit_percentage: 25,
};

// Returns the saved profile, or the brand.ts fallback if the table is missing/empty.
export async function fetchBusinessProfile(): Promise<{
  profile: BusinessProfile;
  fromDb: boolean;
}> {
  try {
    const supabase = getBrowserClient();
    const { data, error } = await supabase
      .from("business_profile")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { profile: FALLBACK_PROFILE, fromDb: false };
    return { profile: data as BusinessProfile, fromDb: true };
  } catch {
    return { profile: FALLBACK_PROFILE, fromDb: false };
  }
}

export async function saveBusinessProfile(
  profile: BusinessProfile
): Promise<BusinessProfile> {
  const supabase = getBrowserClient();
  const payload = { ...profile };
  let res;
  if (profile.id) {
    res = await supabase
      .from("business_profile")
      .update(payload)
      .eq("id", profile.id)
      .select()
      .single();
  } else {
    res = await supabase.from("business_profile").insert(payload).select().single();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data as BusinessProfile;
}
