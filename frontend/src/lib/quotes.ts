import { getBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Backend-readiness gate.
// Flip to `true` ONLY after migration 0014 (pricing columns + mutation RPCs)
// is applied AND verified. Until then, every quote WRITE action is blocked in
// the UI and clearly labeled "Backend setup required". READS already work via
// authenticated, RLS-scoped table access (migration 0011, applied).
// ---------------------------------------------------------------------------
export const QUOTES_WRITE_ENABLED = true;

export const BACKEND_REQUIRED_MSG =
  "Backend setup required — apply migration 0014 (quote RPCs) to enable this action.";

// ---------------------------------------------------------------------------
// Status model (Option 1): canonical DB values keep 'accepted' / 'rejected';
// the UI labels them "Approved" / "Declined".
// ---------------------------------------------------------------------------
export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "converted",
  "cancelled",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export function quoteStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
      return "Approved";
    case "rejected":
      return "Declined";
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "viewed":
      return "Viewed";
    case "expired":
      return "Expired";
    case "converted":
      return "Converted";
    case "cancelled":
      return "Cancelled";
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
  }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
export interface QuoteCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface QuoteLineItem {
  id?: string;
  quote_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total?: number;
  sort_order?: number;
}

export interface QuoteRecord {
  id: string;
  company_id: string;
  lead_id: string | null;
  customer_id: string | null;
  status: QuoteStatus;
  quote_number: string;
  hourly_rate: number | null;
  estimated_hours: number | null;
  travel_fee: number | null;
  packing_fee: number | null;
  materials_fee: number | null;
  discount: number | null;
  tax_rate?: number | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  deposit_percent?: number | null;
  deposit_amount?: number | null;
  expires_at: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: QuoteCustomer | null;
  [key: string]: unknown;
}

const QUOTE_SELECT = "*, customers(id, first_name, last_name, email, phone)";

export async function fetchQuotes(companyId: string): Promise<QuoteRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QuoteRecord[];
}

export async function fetchQuoteLineItems(quoteId: string): Promise<QuoteLineItem[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("quote_line_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QuoteLineItem[];
}

// ---------------------------------------------------------------------------
// Pricing PREVIEW — mirrors the authoritative server engine
// (_compute_quote_totals in 0014). Percent inputs are 0..100. This is for
// display only; the database recomputes and persists the real totals.
// ---------------------------------------------------------------------------
export interface PricingInputs {
  hourly_rate?: number | null;
  estimated_hours?: number | null;
  travel_fee?: number | null;
  packing_fee?: number | null;
  materials_fee?: number | null;
  discount?: number | null;
  tax_rate?: number | null;
  deposit_percent?: number | null;
  line_items: { quantity: number; unit_price: number }[];
}

export interface PricingResult {
  laborAmount: number;
  lineItemAmount: number;
  grossSubtotal: number;
  discount: number;
  discountedSubtotal: number;
  tax: number;
  total: number;
  depositAmount: number;
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
const nz = (v: number | null | undefined) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

export function computeQuoteTotalsPreview(i: PricingInputs): PricingResult {
  const labor = r2(nz(i.hourly_rate) * nz(i.estimated_hours));
  const items = r2(
    i.line_items.reduce((s, li) => s + nz(li.quantity) * nz(li.unit_price), 0)
  );
  const gross = r2(
    labor + items + nz(i.travel_fee) + nz(i.packing_fee) + nz(i.materials_fee)
  );
  const discount = Math.min(Math.max(nz(i.discount), 0), gross);
  const discounted = r2(Math.max(gross - discount, 0));
  const tax = r2((discounted * nz(i.tax_rate)) / 100);
  const total = r2(Math.max(discounted + tax, 0));
  const deposit = r2((total * nz(i.deposit_percent)) / 100);
  return {
    laborAmount: labor,
    lineItemAmount: items,
    grossSubtotal: gross,
    discount,
    discountedSubtotal: discounted,
    tax,
    total,
    depositAmount: deposit,
  };
}

// ---------------------------------------------------------------------------
// Mutation RPC wrappers — names + argument names/types mirror migration 0014
// EXACTLY. All writes flow through SECURITY DEFINER RPCs (no direct table
// INSERT/UPDATE/DELETE). These will succeed only after 0014 is applied.
// ---------------------------------------------------------------------------
export interface QuoteLineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  sort_order?: number;
}

export interface QuoteScalarInput {
  hourly_rate?: number | null;
  estimated_hours?: number | null;
  travel_fee?: number | null;
  packing_fee?: number | null;
  materials_fee?: number | null;
  discount?: number | null;
  tax_rate?: number | null;
  deposit_percent?: number | null;
  expires_at?: string | null;
  line_items: QuoteLineItemInput[];
}

export interface CreateQuoteInput extends QuoteScalarInput {
  lead_id?: string | null;
  customer_id?: string | null;
}

export async function createQuoteWithItems(
  input: CreateQuoteInput
): Promise<{ quote_id: string; quote_number: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("create_quote_with_items", {
    p_lead_id: input.lead_id ?? null,
    p_customer_id: input.customer_id ?? null,
    p_hourly_rate: input.hourly_rate ?? null,
    p_estimated_hours: input.estimated_hours ?? null,
    p_travel_fee: input.travel_fee ?? 0,
    p_packing_fee: input.packing_fee ?? 0,
    p_materials_fee: input.materials_fee ?? 0,
    p_discount: input.discount ?? 0,
    p_tax_rate: input.tax_rate ?? 0,
    p_deposit_percent: input.deposit_percent ?? 0,
    p_expires_at: input.expires_at ?? null,
    p_line_items: input.line_items,
  });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; quote_number: string };
}

export async function updateDraftQuoteWithItems(
  quoteId: string,
  input: QuoteScalarInput
): Promise<{ quote_id: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("update_draft_quote_with_items", {
    p_quote_id: quoteId,
    p_hourly_rate: input.hourly_rate ?? null,
    p_estimated_hours: input.estimated_hours ?? null,
    p_travel_fee: input.travel_fee ?? 0,
    p_packing_fee: input.packing_fee ?? 0,
    p_materials_fee: input.materials_fee ?? 0,
    p_discount: input.discount ?? 0,
    p_tax_rate: input.tax_rate ?? 0,
    p_deposit_percent: input.deposit_percent ?? 0,
    p_expires_at: input.expires_at ?? null,
    p_line_items: input.line_items,
  });
  if (error) throw new Error(error.message);
  return data as { quote_id: string };
}

export async function duplicateQuote(quoteId: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("duplicate_quote", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; quote_number: string };
}

export async function markQuoteSent(quoteId: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("mark_quote_sent", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; status: string };
}

export async function expireQuote(quoteId: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("expire_quote", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; status: string };
}

export async function cancelQuote(quoteId: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("cancel_quote", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; status: string };
}

// ---------------------------------------------------------------------------
// Approval links (migration 0015). Issuance is staff-only; view/respond are
// token-bearer (work for anon — customer needs no account).
// ---------------------------------------------------------------------------
export interface ApprovalLinkResult {
  quote_id: string;
  token: string;
  expires_at: string;
}

export interface PublicQuoteLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface PublicQuote {
  id: string;
  quote_number: string;
  status: string;
  created_at: string;
  expires_at: string | null;
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
  customer: { first_name: string | null; last_name: string | null };
  line_items: PublicQuoteLineItem[];
}

export async function createQuoteApprovalLink(
  quoteId: string,
  expiresAt?: string
): Promise<ApprovalLinkResult> {
  const supabase = getBrowserClient();
  const args: Record<string, unknown> = { p_quote_id: quoteId };
  if (expiresAt) args.p_expires_at = expiresAt;
  const { data, error } = await supabase.rpc("create_quote_approval_link", args);
  if (error) throw new Error(error.message);
  return data as ApprovalLinkResult;
}

export async function revokeQuoteApprovalLinks(quoteId: string) {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("revoke_quote_approval_links", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; revoked_count: number };
}

export async function getQuoteByApprovalToken(token: string): Promise<PublicQuote> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("get_quote_by_approval_token", { p_token: token });
  if (error) throw new Error(error.message);
  return data as PublicQuote;
}

export async function respondToQuoteApproval(token: string, decision: "accept" | "decline") {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("respond_to_quote_approval", {
    p_token: token,
    p_decision: decision,
  });
  if (error) throw new Error(error.message);
  return data as { quote_id: string; status: string };
}
