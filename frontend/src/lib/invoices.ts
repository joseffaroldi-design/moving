import { getBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Invoices service — authenticated, RLS-scoped reads (migration 0018) + the
// verified SECURITY DEFINER mutation RPCs. Invoice tables are locked down:
// `authenticated` has SELECT only (RLS scopes every read to the caller's
// company); ALL writes flow through company/role-enforcing RPCs. There are
// NO direct client INSERT/UPDATE/DELETE here. Client-computed totals are for
// PREVIEW only — the database RPC result is always authoritative.
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Roles allowed to MUTATE invoices (mirrors _require_invoice_mutator in 0018).
// UI gating is for usability only; the database is the authoritative enforcer.
export const INVOICE_MUTATOR_ROLES = ["owner", "operations_manager", "sales"];
export function canMutateInvoice(role: string | null | undefined): boolean {
  return !!role && INVOICE_MUTATOR_ROLES.includes(role);
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;

export function invoiceStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "draft": return "Draft";
    case "sent": return "Sent";
    case "partially_paid": return "Partially Paid";
    case "paid": return "Paid";
    case "void": return "Void";
    case "overdue": return "Overdue";
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
  }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
export interface InvoiceCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface InvoiceJobRef {
  id: string;
  job_number: string | null;
  status: string | null;
}

export interface InvoiceLineItem {
  id?: string;
  invoice_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total?: number;
  sort_order?: number;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  method: string;
  paid_at: string;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface InvoiceRecord {
  id: string;
  company_id: string;
  job_id: string | null;
  quote_id: string | null;
  customer_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  subtotal: number;
  tax_rate: number;
  tax: number;
  total: number;
  amount_paid: number;
  balance: number;
  notes: string | null;
  due_date: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: InvoiceCustomer | null;
  jobs?: InvoiceJobRef | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Derived "overdue" display state. Overdue is NOT a stored status the RPCs
// ever set; it is computed for display: a sent / partially_paid invoice with
// a positive balance whose due date has passed.
// ---------------------------------------------------------------------------
export function isOverdue(inv: Pick<InvoiceRecord, "status" | "due_date" | "balance">): boolean {
  if (!inv.due_date) return false;
  if (inv.status !== "sent" && inv.status !== "partially_paid") return false;
  if (!(Number(inv.balance) > 0)) return false;
  const due = new Date(inv.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export function effectiveInvoiceStatus(inv: InvoiceRecord): string {
  return isOverdue(inv) ? "overdue" : inv.status;
}

export function invoiceCustomerName(inv: InvoiceRecord): string {
  const c = inv.customers;
  if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer";
  return "Customer";
}

const INVOICE_SELECT =
  "*, customers(id, first_name, last_name, email, phone), jobs(id, job_number, status)";

export async function fetchInvoices(companyId: string): Promise<InvoiceRecord[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceRecord[];
}

export async function fetchInvoiceById(id: string): Promise<InvoiceRecord | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as InvoiceRecord) ?? null;
}

export async function fetchInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceLineItem[];
}

export async function fetchInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("paid_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoicePayment[];
}

// Returns the existing invoice id for a job (RLS-scoped), or null.
export async function fetchInvoiceIdForJob(jobId: string): Promise<string | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}

export interface EligibleJob {
  id: string;
  job_number: string | null;
  status: string;
  scheduled_start: string | null;
  customers?: { first_name: string | null; last_name: string | null } | null;
}

// Completed jobs that do NOT yet have an invoice (candidates for generation).
export async function fetchCompletedJobsWithoutInvoice(companyId: string): Promise<EligibleJob[]> {
  const supabase = getBrowserClient();
  const [{ data: jobs, error: jErr }, { data: invs, error: iErr }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, status, scheduled_start, customers(first_name, last_name)")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .order("scheduled_start", { ascending: false }),
    supabase.from("invoices").select("job_id").eq("company_id", companyId),
  ]);
  if (jErr) throw new Error(jErr.message);
  if (iErr) throw new Error(iErr.message);
  const invoicedJobIds = new Set((invs ?? []).map((r) => (r as { job_id: string | null }).job_id).filter(Boolean));
  return ((jobs ?? []) as unknown as EligibleJob[]).filter((j) => !invoicedJobIds.has(j.id));
}

export interface UnpaidSummary {
  outstanding: number; // sum of balance on sent + partially_paid
  unpaidCount: number; // sent/partially_paid with balance > 0
  overdueCount: number; // of the above, past due date
  overdueAmount: number;
}

export async function fetchUnpaidSummary(companyId: string): Promise<UnpaidSummary> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("status, balance, due_date")
    .eq("company_id", companyId)
    .in("status", ["sent", "partially_paid"]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { status: InvoiceStatus; balance: number; due_date: string | null }[];
  let outstanding = 0, unpaidCount = 0, overdueCount = 0, overdueAmount = 0;
  for (const r of rows) {
    const bal = Number(r.balance) || 0;
    if (bal > 0) {
      outstanding += bal;
      unpaidCount += 1;
      if (isOverdue(r)) {
        overdueCount += 1;
        overdueAmount += bal;
      }
    }
  }
  return {
    outstanding: Math.round(outstanding * 100) / 100,
    unpaidCount,
    overdueCount,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Totals PREVIEW — mirrors _compute_invoice_totals (0018). Display only; the
// database recomputes and persists the authoritative totals on every write.
// ---------------------------------------------------------------------------
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
const nz = (v: number | null | undefined) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

export interface InvoicePreview {
  subtotal: number;
  tax: number;
  total: number;
  balance: number;
}

export function computeInvoiceTotalsPreview(
  lineItems: { quantity: number; unit_price: number }[],
  taxRate: number | null | undefined,
  amountPaid: number | null | undefined = 0
): InvoicePreview {
  const subtotal = r2(lineItems.reduce((s, li) => s + nz(li.quantity) * nz(li.unit_price), 0));
  const tax = r2((subtotal * nz(taxRate)) / 100);
  const total = r2(Math.max(subtotal + tax, 0));
  const balance = r2(total - nz(amountPaid));
  return { subtotal, tax, total, balance };
}

// ---------------------------------------------------------------------------
// Mutation RPC wrappers — names + arg names/types mirror migration 0018
// EXACTLY. All are SECURITY DEFINER with company + role enforcement.
// ---------------------------------------------------------------------------
export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  sort_order?: number;
}

export async function generateInvoiceForJob(
  jobId: string
): Promise<{ invoice_id: string; created: boolean }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("generate_invoice_for_job", { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return data as { invoice_id: string; created: boolean };
}

export interface UpdateDraftInvoiceInput {
  tax_rate?: number | null;
  notes?: string | null;
  due_date?: string | null;
  line_items: InvoiceLineItemInput[];
}

export async function updateDraftInvoiceWithItems(
  invoiceId: string,
  input: UpdateDraftInvoiceInput
): Promise<{ invoice_id: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("update_draft_invoice_with_items", {
    p_invoice_id: invoiceId,
    p_tax_rate: input.tax_rate ?? 0,
    p_notes: input.notes ?? null,
    p_due_date: input.due_date ?? null,
    p_line_items: input.line_items,
  });
  if (error) throw new Error(error.message);
  return data as { invoice_id: string };
}

export async function markInvoiceSent(invoiceId: string): Promise<{ invoice_id: string; status: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("mark_invoice_sent", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
  return data as { invoice_id: string; status: string };
}

export interface RecordPaymentInput {
  amount: number;
  method?: string;
  paid_at?: string | null;
  note?: string | null;
}

export async function recordInvoicePayment(
  invoiceId: string,
  input: RecordPaymentInput
): Promise<{ invoice_id: string; status: string; balance: number }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    p_invoice_id: invoiceId,
    p_amount: input.amount,
    p_method: input.method ?? "other",
    p_paid_at: input.paid_at ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { invoice_id: string; status: string; balance: number };
}

export async function voidInvoice(invoiceId: string): Promise<{ invoice_id: string; status: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("void_invoice", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
  return data as { invoice_id: string; status: string };
}
