// Pure, framework-free customer-portal helpers.
// Tested directly by node --test (see tests/portalLogic.test.mjs). Kept in plain
// JS (with a sibling .d.ts) so the exact runtime code used by the app is unit-tested.

const NON_OUTSTANDING = new Set(["paid", "void", "draft"]);

// Classify the structured portal_approve_quote response. Expired is NOT an error.
export function classifyApproval(json) {
  const obj = json && typeof json === "object" ? json : {};
  const status = String(obj.status ?? "");
  const quoteId = obj.quote_id != null ? String(obj.quote_id) : null;
  if (status === "accepted") return { status: "accepted", approved: true, quoteId };
  if (status === "expired") return { status: "expired", approved: false, quoteId };
  return { status: "unknown", approved: false, quoteId };
}

// Derived, display-only overdue: positive balance, past due date, and stored
// status is not paid/void/draft. Never a stored status.
export function isPortalOverdue(inv) {
  if (!inv || !inv.due_date) return false;
  const status = String(inv.status ?? "").toLowerCase();
  if (NON_OUTSTANDING.has(status)) return false;
  const balance = Number(inv.balance);
  if (!(balance > 0)) return false;
  const due = new Date(inv.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

// Always supply all four params; trim client-side. Blank = keep current value.
export function buildContactArgs(form) {
  const t = (v) => (typeof v === "string" ? v.trim() : "");
  return {
    p_first_name: t(form && form.firstName),
    p_last_name: t(form && form.lastName),
    p_email: t(form && form.email),
    p_phone: t(form && form.phone),
  };
}

const KNOWN = [
  "Not authorized as a customer",
  "Quote not found",
  "Job not found",
  "Invoice not found",
  "This quote has expired",
  "Audit identity could not be resolved for the current user",
];

// Never leak raw Supabase/DB internals to customers.
export function safeErrorMessage(err) {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String(err.message ?? "")
      : String(err ?? "");
  if (raw.includes("This quote is not awaiting a decision")) {
    return "This quote is no longer awaiting your decision.";
  }
  for (const m of KNOWN) {
    if (raw.includes(m)) return m.endsWith(".") ? m : m + ".";
  }
  return "Something went wrong. Please try again.";
}

// Sum outstanding balances from a page of invoice list items.
export function outstandingBalance(items) {
  if (!Array.isArray(items)) return 0;
  let sum = 0;
  for (const it of items) {
    const status = String(it && it.status ? it.status : "").toLowerCase();
    if (NON_OUTSTANDING.has(status)) continue;
    const bal = Number(it && it.balance);
    if (bal > 0) sum += bal;
  }
  return Math.round(sum * 100) / 100;
}

// UI belief only; the RPC is always authoritative.
export function quoteLooksApprovable(quote) {
  if (!quote) return false;
  const status = String(quote.status ?? "").toLowerCase();
  if (status !== "sent" && status !== "viewed") return false;
  if (quote.expires_at) {
    const exp = new Date(quote.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) return false;
  }
  return true;
}
