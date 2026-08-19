import { getBrowserClient } from "@/lib/supabase/client";
import { isNotCrewError, crewErrorMessage, crewRoleLabel } from "@/lib/crewLogic";

export { isNotCrewError, crewErrorMessage, crewRoleLabel };
export { jobStatusLabel } from "@/lib/jobs";

export type CrewScope = "active" | "completed" | "all";
export type CrewPhotoCategory = "existing_condition" | "special_item" | "loading" | "issue" | "completion" | "other";
export type CrewIssueCategory = "access" | "customer_request" | "property_condition" | "item_condition" | "safety" | "schedule" | "other";
export type CrewMoveDayStatus = "assigned" | "en_route" | "arrived" | "loading" | "in_transit" | "unloading" | "completed" | "issue";

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

export interface CrewTimeState {
  clocked_in: boolean;
  time_entry_id?: string;
  job_id?: string | null;
  clock_in_at?: string;
  clock_out_at?: string;
  total_minutes?: number;
}

export interface CrewChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
}

export interface CrewJobPhoto {
  id: string;
  document_id: string | null;
  caption: string | null;
  photo_stage: string | null;
  taken_at: string;
  taken_by: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  signed_url?: string | null;
}

export interface CrewMoveDayReadiness {
  ready: boolean;
  reasons: string[];
  checklist_total: number;
  checklist_incomplete: number;
  active_clock_count: number;
  required_document_count: number;
  unsigned_required_document_count: number;
  completion_acknowledgment_present: boolean;
  completion_acknowledgment_signed: boolean;
}

export interface CrewIssueResult {
  id: string;
  job_id: string;
  category: CrewIssueCategory;
  reported_at: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export async function crewListJobs(scope: CrewScope = "active", limit = 50, offset = 0): Promise<CrewListResponse> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_list_jobs", { p_scope: scope, p_limit: limit, p_offset: offset });
  if (error) throw new Error(error.message);
  return data as CrewListResponse;
}

export async function crewGetJob(jobId: string): Promise<CrewJobDetail> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_get_job", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return data as CrewJobDetail;
}

export async function crewGetTimeState(): Promise<CrewTimeState> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_get_time_state");
  if (error) throw new Error(error.message);
  return data as CrewTimeState;
}

export async function crewClockIn(jobId?: string | null): Promise<CrewTimeState> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_clock_in", { p_job_id: jobId || null });
  if (error) throw new Error(error.message);
  return data as CrewTimeState;
}

export async function crewClockOut(): Promise<CrewTimeState> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_clock_out");
  if (error) throw new Error(error.message);
  return data as CrewTimeState;
}

export async function crewPrepareChecklist(jobId: string): Promise<CrewChecklistItem[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_prepare_checklist", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return (data ?? []) as CrewChecklistItem[];
}

export async function crewSetChecklistItem(jobId: string, itemId: string, completed: boolean): Promise<CrewChecklistItem> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_set_checklist_item", { p_job_id: jobId, p_item_id: itemId, p_completed: completed });
  if (error) throw new Error(error.message);
  return data as CrewChecklistItem;
}

export async function crewGetMoveDayReadiness(jobId: string): Promise<CrewMoveDayReadiness> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_move_day_readiness", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return data as CrewMoveDayReadiness;
}

export async function crewUpdateMoveDayStatus(jobId: string, status: CrewMoveDayStatus, note?: string): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase.functions.invoke("crew-job-status-update", {
    body: { job_id: jobId, status, note: note?.trim() || null },
  });
  if (error) throw new Error(error.message);
}

export async function crewReportIssue(jobId: string, category: CrewIssueCategory, note: string): Promise<CrewIssueResult> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_report_issue", { p_job_id: jobId, p_category: category, p_note: note.trim() });
  if (error) throw new Error(error.message);
  return data as CrewIssueResult;
}

export async function crewListJobPhotos(jobId: string): Promise<CrewJobPhoto[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("crew_list_job_photos", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  const photos = (data ?? []) as CrewJobPhoto[];
  return Promise.all(photos.map(async (photo) => {
    if (!photo.storage_path) return photo;
    const { data: signed } = await supabase.storage.from("job-photos").createSignedUrl(photo.storage_path, 60 * 60);
    return { ...photo, signed_url: signed?.signedUrl ?? null };
  }));
}

export async function crewUploadJobPhoto(
  jobId: string,
  file: File,
  options: { caption?: string; photoStage?: CrewPhotoCategory; operationalIssueId?: string | null } = {}
): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Photo must be 15 MB or smaller.");

  const supabase = getBrowserClient();
  const { data: context, error: contextError } = await supabase.rpc("crew_photo_upload_context", { p_job_id: jobId });
  if (contextError) throw new Error(contextError.message);

  const pathPrefix = String((context as { path_prefix?: string })?.path_prefix ?? "");
  if (!pathPrefix) throw new Error("Photo upload context could not be created.");

  const originalExt = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const ext = String(originalExt || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const path = `${pathPrefix}${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: registerError } = await supabase.rpc("crew_register_job_photo", {
    p_job_id: jobId,
    p_storage_path: path,
    p_caption: options.caption?.trim() || null,
    p_photo_stage: options.photoStage || null,
    p_mime_type: file.type || "image/jpeg",
    p_size_bytes: file.size,
    p_operational_issue_id: options.operationalIssueId || null,
  });
  if (registerError) throw new Error(`Photo uploaded but metadata registration failed: ${errorMessage(registerError)}`);
}
