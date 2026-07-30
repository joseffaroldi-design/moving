import { getBrowserClient } from "@/lib/supabase/client";
import {
  classifyApproval,
  isPortalOverdue,
  buildContactArgs,
  safeErrorMessage,
  outstandingBalance,
  quoteLooksApprovable,
} from "@/lib/portalLogic";

// ---------------------------------------------------------------------------
// Customer Portal service layer — Phase 9 (migration 0026).
//
// STRICT SECURITY BOUNDARY: the portal NEVER reads customer/quote/job/invoice
// base tables directly. Every interaction flows through the 8 authenticated
// SECURITY DEFINER RPCs below, which return an explicit, whitelisted set of
// customer-safe fields (RLS filters rows, not columns, so broad SELECT would
// leak internal columns). Identity is resolved server-side from auth.uid().
// ---------------------------------------------------------------------------

// Re-export the pure, unit-tested helpers so callers import from one place.
export {
  classifyApproval,
  isPortalOverdue,
  buildContactArgs,
  safeErrorMessage,
  outstandingBalance,
  quoteLooksApprovable,
};

// The internal resolver returns null → RPC raises this when the signed-in user
// is authenticated but is not a linked customer (e.g. a staff account).
export const NOT_CUSTOMER_MSG = "Not authorized as a customer";

export function isNotCustomerError(err: unknown): boolean {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err ?? "");
  return raw.includes(NOT_CUSTOMER_MSG);
}

// ---------------------------------------------------------------------------
// Record shapes — mirror the json_build_object outputs in 0026 EXACTLY.
// ---------------------------------------------------------------------------
export interface PortalListResponse<T> {
  items: T[];
  count: number;
  limit: number;
  offset: number;
}

export interface PortalLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface PortalQuoteListItem {
  id: string;
  quote_number: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  total: number | null;
  deposit_amount: number | null;
}

export interface PortalQuoteDetail {
  id: string;
  quote_number: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  hourly_rate: number | null;
  estimated_hours: number | null;
  travel_fee: number | null;
  packing_fee: number | null;
  materials_fee: number | null;
  discount: number | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax: number | null;
  total: number | null;
  deposit_percent: number | null;
  deposit_amount: number | null;
  line_items: PortalLineItem[];
}

export interface PortalJobListItem {
  id: string;
  job_number: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  origin_address: string | null;
  destination_address: string | null;
}

export type PortalJobDetail = PortalJobListItem;

export interface PortalInvoiceListItem {
  id: string;
  invoice_number: string;
  status: string;
  total: number | null;
  amount_paid: number | null;
  balance: number | null;
  due_date: string | null;
  sent_at: string | null;
}

export interface PortalPayment {
  amount: number;
  method: string;
  paid_at: string;
}

export interface PortalInvoiceDetail {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number | null;
  tax_rate: number | null;
  tax: number | null;
  total: number | null;
  amount_paid: number | null;
  balance: number | null;
  due_date: string | null;
  sent_at: string | null;
  line_items: PortalLineItem[];
  payments: PortalPayment[];
}

export interface PortalApprovalResult {
  quoteId: string | null;
  status: string;
  approved: boolean;
}

// ---------------------------------------------------------------------------
// RPC wrappers — names + argument names mirror migration 0026 EXACTLY.
// ---------------------------------------------------------------------------
export async function portalListQuotes(
  limit = 20,
  offset = 0
): Promise<PortalListResponse<PortalQuoteListItem>> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_list_quotes", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return data as PortalListResponse<PortalQuoteListItem>;
}

export async function portalGetQuote(quoteId: string): Promise<PortalQuoteDetail> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_get_quote", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as PortalQuoteDetail;
}

export async function portalListJobs(
  limit = 20,
  offset = 0
): Promise<PortalListResponse<PortalJobListItem>> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_list_jobs", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return data as PortalListResponse<PortalJobListItem>;
}

export async function portalGetJob(jobId: string): Promise<PortalJobDetail> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_get_job", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return data as PortalJobDetail;
}

export async function portalListInvoices(
  limit = 20,
  offset = 0
): Promise<PortalListResponse<PortalInvoiceListItem>> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_list_invoices", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return data as PortalListResponse<PortalInvoiceListItem>;
}

export async function portalGetInvoice(invoiceId: string): Promise<PortalInvoiceDetail> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_get_invoice", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
  return data as PortalInvoiceDetail;
}

export async function portalApproveQuote(quoteId: string): Promise<PortalApprovalResult> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_approve_quote", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return classifyApproval(data) as PortalApprovalResult;
}

export interface PortalContactForm {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export async function portalUpdateContact(
  form: PortalContactForm
): Promise<{ customer_id: string; updated: boolean }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_update_contact", buildContactArgs(form));
  if (error) throw new Error(error.message);
  return data as { customer_id: string; updated: boolean };
}

// ---------------------------------------------------------------------------
// Display helpers (labels reuse the existing staff formatters).
// ---------------------------------------------------------------------------
export { quoteStatusLabel } from "@/lib/quotes";
export { invoiceStatusLabel } from "@/lib/invoices";
export { jobStatusLabel } from "@/lib/jobs";
