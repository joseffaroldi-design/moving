import { getBrowserClient } from "@/lib/supabase/client";

export type MoveDocumentKey =
  | "service_agreement"
  | "valuation_acknowledgment"
  | "scope_change_authorization"
  | "completion_acknowledgment";

export interface MoveDocumentListItem {
  id: string;
  job_id?: string;
  document_key: MoveDocumentKey;
  title: string;
  version_no: number;
  finalized_at: string | null;
  lifecycle_status?: "draft" | "finalized" | "voided";
  signature_required: boolean;
  signature_status: string;
  signed_at: string | null;
  signer_name?: string | null;
  content_sha256?: string | null;
}

export interface MoveDocumentDetail extends MoveDocumentListItem {
  content_snapshot: string;
  content_sha256: string;
  signer_name: string | null;
  signed_content_sha256: string | null;
}

function message(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Move document request failed.";
}

export async function portalListMoveDocuments(): Promise<MoveDocumentListItem[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_list_move_documents");
  if (error) throw new Error(message(error));
  const payload = data as { items?: MoveDocumentListItem[] } | null;
  return payload?.items ?? [];
}

export async function portalGetMoveDocument(id: string): Promise<MoveDocumentDetail> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_get_move_document", { p_document_id: id });
  if (error) throw new Error(message(error));
  return data as MoveDocumentDetail;
}

export async function portalSignMoveDocument(id: string, signerName: string, signatureData: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_sign_move_document", {
    p_document_id: id,
    p_signer_name: signerName,
    p_signature_data: signatureData,
    p_user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
  });
  if (error) throw new Error(message(error));
  return data as { signed: boolean; already_signed: boolean; signed_at: string };
}

export async function staffListMoveDocuments(jobId: string): Promise<MoveDocumentListItem[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("staff_list_move_documents", { p_job_id: jobId });
  if (error) throw new Error(message(error));
  const payload = data as { items?: MoveDocumentListItem[] } | null;
  return payload?.items ?? [];
}

export async function staffFinalizeMoveDocument(input: {
  jobId: string;
  documentKey: MoveDocumentKey;
  title: string;
  contentSnapshot: string;
  signatureRequired: boolean;
  supersedesDocumentId?: string | null;
}) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("staff_finalize_move_document_snapshot", {
    p_job_id: input.jobId,
    p_document_key: input.documentKey,
    p_title: input.title,
    p_content_snapshot: input.contentSnapshot,
    p_signature_required: input.signatureRequired,
    p_supersedes_document_id: input.supersedesDocumentId ?? null,
  });
  if (error) throw new Error(message(error));
  return data as { id: string; version_no: number; content_sha256: string };
}

export async function staffVoidUnsignedMoveDocument(id: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("staff_void_unsigned_move_document", { p_document_id: id });
  if (error) throw new Error(message(error));
  return data as { id: string; voided: boolean };
}

export const MOVE_DOCUMENT_LABELS: Record<MoveDocumentKey, string> = {
  service_agreement: "Service / Move Agreement",
  valuation_acknowledgment: "Valuation / Liability Acknowledgment",
  scope_change_authorization: "Scope Change Authorization",
  completion_acknowledgment: "Completion Acknowledgment",
};
