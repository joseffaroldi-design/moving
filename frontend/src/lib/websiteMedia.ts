import { getBrowserClient } from "@/lib/supabase/client";

export type WebsiteMediaSlot =
  | "hero_background"
  | "hero_crew"
  | "service_residential"
  | "service_commercial"
  | "service_packing"
  | "service_specialty"
  | "service_local"
  | "service_long_distance";

export interface WebsiteMediaRecord {
  id?: string;
  company_id: string;
  slot: WebsiteMediaSlot;
  storage_path: string;
  public_url: string;
  alt_text?: string | null;
  is_published?: boolean;
}

export const WEBSITE_MEDIA_BUCKET = "website-media";
export const MARKETING_COMPANY_ID =
  process.env.NEXT_PUBLIC_MARKETING_COMPANY_ID || "f05941f2-13db-4779-a1f3-2d6a74ccffcd";

export const WEBSITE_MEDIA_SLOTS: Array<{
  slot: WebsiteMediaSlot;
  label: string;
  description: string;
  defaultUrl: string;
}> = [
  { slot: "hero_background", label: "Homepage hero background", description: "Main New Orleans skyline/background image.", defaultUrl: "/brand/login-art-full.jpg" },
  { slot: "hero_crew", label: "Homepage crew image", description: "Crew photo blended into the homepage hero.", defaultUrl: "/brand/photos/hero-crew.jpg" },
  { slot: "service_residential", label: "Residential moving", description: "Residential service card image.", defaultUrl: "/brand/photos/svc-residential.jpg" },
  { slot: "service_commercial", label: "Commercial moving", description: "Commercial service card image.", defaultUrl: "/brand/photos/svc-commercial.jpg" },
  { slot: "service_packing", label: "Packing services", description: "Packing service card image.", defaultUrl: "/brand/photos/svc-packing.jpg" },
  { slot: "service_specialty", label: "Specialty moving", description: "Specialty-item service card image.", defaultUrl: "/brand/photos/svc-specialty.jpg" },
  { slot: "service_local", label: "Local moving", description: "Local moving service card image.", defaultUrl: "/brand/photos/svc-local.jpg" },
  { slot: "service_long_distance", label: "Long-distance moving", description: "Long-distance service card image.", defaultUrl: "/brand/photos/svc-longdistance.jpg" },
];

export async function fetchWebsiteMedia(companyId: string): Promise<WebsiteMediaRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("website_media")
    .select("id,company_id,slot,storage_path,public_url,alt_text,is_published")
    .eq("company_id", companyId)
    .eq("is_published", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as WebsiteMediaRecord[];
}

export async function uploadWebsiteMedia(
  companyId: string,
  slot: WebsiteMediaSlot,
  file: File,
  altText: string
): Promise<WebsiteMediaRecord> {
  const supabase = getBrowserClient();
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storagePath = `${companyId}/${slot}/${Date.now()}.${extension || "jpg"}`;

  const current = await supabase
    .from("website_media")
    .select("storage_path")
    .eq("company_id", companyId)
    .eq("slot", slot)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);

  const uploaded = await supabase.storage.from(WEBSITE_MEDIA_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);

  const { data: urlData } = supabase.storage.from(WEBSITE_MEDIA_BUCKET).getPublicUrl(storagePath);
  const payload: WebsiteMediaRecord = {
    company_id: companyId,
    slot,
    storage_path: storagePath,
    public_url: urlData.publicUrl,
    alt_text: altText.trim() || null,
    is_published: true,
  };

  const saved = await supabase
    .from("website_media")
    .upsert(payload, { onConflict: "company_id,slot" })
    .select("id,company_id,slot,storage_path,public_url,alt_text,is_published")
    .single();

  if (saved.error) {
    await supabase.storage.from(WEBSITE_MEDIA_BUCKET).remove([storagePath]);
    throw new Error(saved.error.message);
  }

  const oldPath = current.data?.storage_path;
  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from(WEBSITE_MEDIA_BUCKET).remove([oldPath]);
  }

  return saved.data as WebsiteMediaRecord;
}

export async function restoreWebsiteMediaDefault(companyId: string, slot: WebsiteMediaSlot): Promise<void> {
  const supabase = getBrowserClient();
  const current = await supabase
    .from("website_media")
    .select("storage_path")
    .eq("company_id", companyId)
    .eq("slot", slot)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);

  const removed = await supabase
    .from("website_media")
    .delete()
    .eq("company_id", companyId)
    .eq("slot", slot);
  if (removed.error) throw new Error(removed.error.message);

  if (current.data?.storage_path) {
    await supabase.storage.from(WEBSITE_MEDIA_BUCKET).remove([current.data.storage_path]);
  }
}
