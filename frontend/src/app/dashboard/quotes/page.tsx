"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Send,
  Briefcase,
  Printer,
  Copy,
  Ban,
  Clock,
  Pencil,
  Trash2,
  Lock,
  AlertTriangle,
  Link2,
  Check,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { fetchCustomers, type CustomerRecord } from "@/lib/customers";
import { fetchLeads, fetchLeadById, type LeadRecord } from "@/lib/leads";
import { leadName } from "@/lib/entities";
import { convertQuoteToJob } from "@/lib/jobs";
import {
  QUOTES_WRITE_ENABLED,
  BACKEND_REQUIRED_MSG,
  QUOTE_STATUSES,
  quoteStatusLabel,
  computeQuoteTotalsPreview,
  fetchQuotes,
  fetchQuoteLineItems,
  createQuoteWithItems,
  updateDraftQuoteWithItems,
  duplicateQuote,
  markQuoteSent,
  expireQuote,
  cancelQuote,
  createQuoteApprovalLink,
  revokeQuoteApprovalLinks,
  type QuoteRecord,
  type QuoteLineItem,
} from "@/lib/quotes";

function quoteName(q: QuoteRecord): string {
  const c = q.customers;
  if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer";
  return "Customer";
}

const toNum = (s: string): number => {
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};

// --------------------------------------------------------------------------

export default function QuotesPage() {
  const { data } = useDashboardData();
  const { me, user } = useAuth();
  const toast = useToast();

  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const userId = user?.id ?? null;
  const canWrite = QUOTES_WRITE_ENABLED && !!companyId && !!userId;

  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editQuote, setEditQuote] = useState<QuoteRecord | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setQuotes((data?.recentQuotes ?? []) as unknown as QuoteRecord[]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setQuotes(await fetchQuotes(companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotes.");
    } finally {
      setLoading(false);
    }
  }, [companyId, data]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      const matchesQuery =
        !query ||
        quoteName(q).toLowerCase().includes(query.toLowerCase()) ||
        String(q.quote_number ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || q.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [quotes, query, status]);

  const selected = useMemo(
    () => quotes.find((q) => q.id === selectedId) ?? null,
    [quotes, selectedId]
  );

  function openCreate() {
    setEditQuote(null);
    setShowBuilder(true);
  }
  function openEdit(q: QuoteRecord) {
    setEditQuote(q);
    setSelectedId(null);
    setShowBuilder(true);
  }

  return (
    <div>
      <PageHeader
        title="Quotes"
        description="Build, send, and track itemized moving estimates."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Quotes" }]}
        actions={
          <Button
            data-testid="new-quote-button"
            disabled={!canWrite}
            title={canWrite ? undefined : BACKEND_REQUIRED_MSG}
            onClick={openCreate}
          >
            {canWrite ? <Plus className="h-4 w-4" /> : <Lock className="h-4 w-4" />} New Quote
          </Button>
        }
      />

      {!QUOTES_WRITE_ENABLED && (
        <div
          data-testid="quotes-backend-banner"
          className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            <strong>Backend setup required.</strong> Quote creation, editing, sending, duplication,
            expiry, and cancellation are ready in the UI but disabled until the secured quote
            operations (migration 0014) are applied and verified. Viewing existing quotes is live.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="quotes-search"
            placeholder="Search by customer or quote #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          data-testid="quotes-status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {QUOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {quoteStatusLabel(s)}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load quotes" message={error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No quotes found"
          description={
            quotes.length === 0
              ? "Create a quote from a lead or customer to get started."
              : "Try adjusting your filters."
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable data-testid="quotes-table">
              <Thead>
                <Th>Quote #</Th>
                <Th>Customer</Th>
                <Th>Total</Th>
                <Th>Sent</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </Thead>
              <Tbody>
                {filtered.map((q, i) => (
                  <Tr
                    key={q.id ?? i}
                    data-testid={`quote-row-${i}`}
                    onClick={() => setSelectedId(q.id)}
                  >
                    <Td className="font-medium text-navy">{q.quote_number || "—"}</Td>
                    <Td>{quoteName(q)}</Td>
                    <Td className="font-medium text-navy">
                      {formatCurrency(q.total ?? q.subtotal)}
                    </Td>
                    <Td className="text-slate-500">{formatDate(q.sent_at)}</Td>
                    <Td className="text-slate-500">{formatDate(q.expires_at)}</Td>
                    <Td>
                      <StatusBadge status={q.status} label={quoteStatusLabel(q.status)} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </DataTable>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((q, i) => (
              <button
                key={q.id ?? i}
                data-testid={`quote-card-${i}`}
                onClick={() => setSelectedId(q.id)}
                className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-navy">{q.quote_number || "—"}</p>
                  <StatusBadge status={q.status} label={quoteStatusLabel(q.status)} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{quoteName(q)}</p>
                <p className="mt-1 font-serif text-lg font-bold text-navy">
                  {formatCurrency(q.total ?? q.subtotal)}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <QuoteBuilderDrawer
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        canWrite={canWrite}
        companyId={companyId}
        editQuote={editQuote}
        onSaved={() => {
          setShowBuilder(false);
          toast(editQuote ? "Quote updated." : "Quote created.", "success");
          load();
        }}
      />

      <QuoteDetailDrawer
        quote={selected}
        onClose={() => setSelectedId(null)}
        canWrite={canWrite}
        onEdit={openEdit}
        onChanged={load}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Quote Builder (create + edit)
// --------------------------------------------------------------------------

interface BuilderLine {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
}

const emptyLine = (): BuilderLine => ({
  key: Math.random().toString(36).slice(2),
  description: "",
  quantity: "1",
  unit_price: "0",
});

const EMPTY_BUILDER = {
  hourly_rate: "",
  estimated_hours: "",
  travel_fee: "",
  packing_fee: "",
  materials_fee: "",
  discount: "",
  tax_rate: "",
  deposit_percent: "",
  expires_at: "",
};

function QuoteBuilderDrawer({
  open,
  onClose,
  canWrite,
  companyId,
  editQuote,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  companyId: string | null;
  editQuote: QuoteRecord | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!editQuote;

  const [sourceType, setSourceType] = useState<"customer" | "lead">("customer");
  const [customerId, setCustomerId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);

  const [form, setForm] = useState({ ...EMPTY_BUILDER });
  const [lines, setLines] = useState<BuilderLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Load selectable customers/leads and prefill on open.
  useEffect(() => {
    if (!open) return;
    if (companyId) {
      fetchCustomers(companyId).then(setCustomers).catch(() => setCustomers([]));
      fetchLeads(companyId).then(setLeads).catch(() => setLeads([]));
    }
    if (editQuote) {
      setSourceType(editQuote.lead_id ? "lead" : "customer");
      setCustomerId(editQuote.customer_id ?? "");
      setLeadId(editQuote.lead_id ?? "");
      setForm({
        hourly_rate: editQuote.hourly_rate?.toString() ?? "",
        estimated_hours: editQuote.estimated_hours?.toString() ?? "",
        travel_fee: editQuote.travel_fee?.toString() ?? "",
        packing_fee: editQuote.packing_fee?.toString() ?? "",
        materials_fee: editQuote.materials_fee?.toString() ?? "",
        discount: editQuote.discount?.toString() ?? "",
        tax_rate: editQuote.tax_rate?.toString() ?? "",
        deposit_percent: editQuote.deposit_percent?.toString() ?? "",
        expires_at: editQuote.expires_at ? editQuote.expires_at.slice(0, 10) : "",
      });
      fetchQuoteLineItems(editQuote.id)
        .then((items) =>
          setLines(
            items.length
              ? items.map((it) => ({
                  key: it.id ?? Math.random().toString(36).slice(2),
                  description: it.description,
                  quantity: String(it.quantity ?? 1),
                  unit_price: String(it.unit_price ?? 0),
                }))
              : [emptyLine()]
          )
        )
        .catch(() => setLines([emptyLine()]));
    } else {
      setSourceType("customer");
      setCustomerId("");
      setLeadId("");
      setForm({ ...EMPTY_BUILDER });
      setLines([emptyLine()]);
    }
  }, [open, companyId, editQuote]);

  function upd<K extends keyof typeof EMPTY_BUILDER>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function updLine(key: string, patch: Partial<BuilderLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, emptyLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  const preview = useMemo(
    () =>
      computeQuoteTotalsPreview({
        hourly_rate: toNum(form.hourly_rate),
        estimated_hours: toNum(form.estimated_hours),
        travel_fee: toNum(form.travel_fee),
        packing_fee: toNum(form.packing_fee),
        materials_fee: toNum(form.materials_fee),
        discount: toNum(form.discount),
        tax_rate: toNum(form.tax_rate),
        deposit_percent: toNum(form.deposit_percent),
        line_items: lines.map((l) => ({
          quantity: toNum(l.quantity),
          unit_price: toNum(l.unit_price),
        })),
      }),
    [form, lines]
  );

  function validate(): string | null {
    if (!isEdit) {
      if (sourceType === "customer" && !customerId) return "Select a customer.";
      if (sourceType === "lead" && !leadId) return "Select a lead.";
    }
    if (toNum(form.tax_rate) < 0 || toNum(form.tax_rate) > 100)
      return "Tax rate must be between 0 and 100.";
    if (toNum(form.deposit_percent) < 0 || toNum(form.deposit_percent) > 100)
      return "Deposit percent must be between 0 and 100.";
    for (const l of lines) {
      const hasAny = l.description.trim() || l.quantity !== "1" || l.unit_price !== "0";
      if (hasAny && !l.description.trim())
        return "Each line item needs a description.";
      if (toNum(l.quantity) < 0 || toNum(l.unit_price) < 0)
        return "Line item quantity and price cannot be negative.";
    }
    if (toNum(form.discount) > preview.grossSubtotal)
      return "Discount cannot exceed the subtotal.";
    return null;
  }

  async function submit() {
    if (savingRef.current) return;
    if (!canWrite) {
      toast(BACKEND_REQUIRED_MSG, "error");
      return;
    }
    const err = validate();
    if (err) {
      toast(err, "error");
      return;
    }
    const lineItems = lines
      .filter((l) => l.description.trim())
      .map((l, idx) => ({
        description: l.description.trim(),
        quantity: toNum(l.quantity),
        unit_price: toNum(l.unit_price),
        sort_order: idx,
      }));
    const scalar = {
      hourly_rate: form.hourly_rate ? toNum(form.hourly_rate) : null,
      estimated_hours: form.estimated_hours ? toNum(form.estimated_hours) : null,
      travel_fee: toNum(form.travel_fee),
      packing_fee: toNum(form.packing_fee),
      materials_fee: toNum(form.materials_fee),
      discount: toNum(form.discount),
      tax_rate: toNum(form.tax_rate),
      deposit_percent: toNum(form.deposit_percent),
      expires_at: form.expires_at || null,
      line_items: lineItems,
    };

    savingRef.current = true;
    setSaving(true);
    try {
      if (isEdit && editQuote) {
        await updateDraftQuoteWithItems(editQuote.id, scalar);
      } else {
        await createQuoteWithItems({
          ...scalar,
          customer_id: sourceType === "customer" ? customerId : null,
          lead_id: sourceType === "lead" ? leadId : null,
        });
      }
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save quote.", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const numField = (
    label: string,
    key: keyof typeof EMPTY_BUILDER,
    opts: { prefix?: string; suffix?: string; step?: string } = {}
  ) => (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        {opts.prefix && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {opts.prefix}
          </span>
        )}
        <Input
          data-testid={`quote-${key}`}
          type="number"
          min="0"
          step={opts.step ?? "0.01"}
          value={form[key]}
          onChange={(e) => upd(key, e.target.value)}
          className={opts.prefix ? "pl-6" : undefined}
        />
        {opts.suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {opts.suffix}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      data-testid="quote-builder-drawer"
      title={isEdit ? `Edit ${editQuote?.quote_number ?? "Quote"}` : "New Quote"}
      footer={
        <div className="flex gap-2">
          <Button
            variant="gold"
            className="flex-1"
            loading={saving}
            disabled={!canWrite}
            title={canWrite ? undefined : BACKEND_REQUIRED_MSG}
            onClick={submit}
            data-testid="submit-quote"
          >
            {canWrite ? null : <Lock className="h-4 w-4" />}
            {isEdit ? "Save Changes" : "Create Quote"}
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="cancel-quote-builder">
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!canWrite && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {BACKEND_REQUIRED_MSG}
          </div>
        )}

        {/* Source */}
        {!isEdit && (
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <div>
              <Label>Quote for</Label>
              <Select
                data-testid="quote-source-type"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as "customer" | "lead")}
              >
                <option value="customer">Existing customer</option>
                <option value="lead">Lead</option>
              </Select>
            </div>
            {sourceType === "customer" ? (
              <div>
                <Label>Customer *</Label>
                <Select
                  data-testid="quote-customer-select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full"
                >
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                      {c.email ? ` · ${c.email}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <Label>Lead *</Label>
                <Select
                  data-testid="quote-lead-select"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  className="w-full"
                >
                  <option value="">Select a lead…</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {leadName(l)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Labor */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Labor
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {numField("Hourly rate", "hourly_rate", { prefix: "$" })}
            {numField("Estimated hours", "estimated_hours", { step: "0.5" })}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Labor is billed as rate × hours. Do not also add a labor line item (avoids
            double-counting).
          </p>
        </div>

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Line Items
            </h4>
            <Button size="sm" variant="subtle" onClick={addLine} data-testid="add-line-item">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div
                key={l.key}
                data-testid={`line-item-${i}`}
                className="grid grid-cols-[1fr_56px_80px_auto] items-center gap-2"
              >
                <Input
                  data-testid={`line-item-desc-${i}`}
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => updLine(l.key, { description: e.target.value })}
                />
                <Input
                  data-testid={`line-item-qty-${i}`}
                  type="number"
                  min="0"
                  step="1"
                  value={l.quantity}
                  onChange={(e) => updLine(l.key, { quantity: e.target.value })}
                />
                <Input
                  data-testid={`line-item-price-${i}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.unit_price}
                  onChange={(e) => updLine(l.key, { unit_price: e.target.value })}
                />
                <button
                  type="button"
                  data-testid={`line-item-remove-${i}`}
                  onClick={() => removeLine(l.key)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Fees */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Fees & Adjustments
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {numField("Travel fee", "travel_fee", { prefix: "$" })}
            {numField("Packing fee", "packing_fee", { prefix: "$" })}
            {numField("Materials fee", "materials_fee", { prefix: "$" })}
            {numField("Discount", "discount", { prefix: "$" })}
            {numField("Tax rate", "tax_rate", { suffix: "%" })}
            {numField("Deposit", "deposit_percent", { suffix: "%" })}
          </div>
        </div>

        {/* Expiry */}
        <div>
          <Label>Expires on</Label>
          <Input
            data-testid="quote-expires-at"
            type="date"
            value={form.expires_at}
            onChange={(e) => upd("expires_at", e.target.value)}
          />
        </div>

        {/* Live preview */}
        <div
          data-testid="quote-preview"
          className="rounded-md border border-slate-200 bg-cream-100 p-3"
        >
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
            Live Preview
          </h4>
          <PreviewRow label="Labor" value={preview.laborAmount} />
          <PreviewRow label="Line items" value={preview.lineItemAmount} />
          <PreviewRow label="Subtotal" value={preview.grossSubtotal} strong />
          {preview.discount > 0 && <PreviewRow label="Discount" value={-preview.discount} />}
          <PreviewRow label="Tax" value={preview.tax} />
          <div className="mt-1 flex justify-between border-t border-gold/40 pt-2 text-sm font-bold text-navy">
            <span>Total</span>
            <span data-testid="preview-total">{formatCurrency(preview.total)}</span>
          </div>
          {preview.depositAmount > 0 && (
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>Deposit due</span>
              <span data-testid="preview-deposit">{formatCurrency(preview.depositAmount)}</span>
            </div>
          )}
          <p className="mt-2 text-[11px] italic text-slate-400">
            Preview only — totals are recalculated and stored by the server on save.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

function PreviewRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${strong ? "font-semibold text-navy" : "text-slate-600"}`}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Quote Detail
// --------------------------------------------------------------------------

function QuoteDetailDrawer({
  quote,
  onClose,
  canWrite,
  onEdit,
  onChanged,
}: {
  quote: QuoteRecord | null;
  onClose: () => void;
  canWrite: boolean;
  onEdit: (q: QuoteRecord) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<QuoteLineItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setItems([]);
    setLink(null);
    setCopied(false);
    if (quote?.id) {
      setItemsLoading(true);
      fetchQuoteLineItems(quote.id)
        .then(setItems)
        .catch(() => setItems([]))
        .finally(() => setItemsLoading(false));
    }
  }, [quote?.id]);

  if (!quote) return <Drawer open={false} onClose={onClose} title="" children={null} />;

  const isDraft = quote.status === "draft";
  const canSend = ["draft", "sent", "viewed"].includes(quote.status);
  const canExpire = ["draft", "sent", "viewed"].includes(quote.status);
  const canCancel = quote.status !== "converted" && quote.status !== "cancelled";
  const canConvert = canWrite && quote.status === "accepted";

  async function run(action: string, fn: () => Promise<unknown>) {
    if (!canWrite) {
      toast(BACKEND_REQUIRED_MSG, "error");
      return;
    }
    setBusy(action);
    try {
      await fn();
      toast("Done.", "success");
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  const disabledTitle = canWrite ? undefined : BACKEND_REQUIRED_MSG;

  const linkable = ["draft", "sent", "viewed"].includes(quote.status);

  async function createLink() {
    setLinkBusy("create");
    try {
      const res = await createQuoteApprovalLink(quote!.id);
      setLink({ url: `${window.location.origin}/q/${res.token}`, expires: res.expires_at });
      setCopied(false);
      toast("Approval link created.", "success");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create link.", "error");
    } finally {
      setLinkBusy(null);
    }
  }

  async function revokeLinks() {
    setLinkBusy("revoke");
    try {
      const r = await revokeQuoteApprovalLinks(quote!.id);
      setLink(null);
      toast(`Revoked ${r.revoked_count} active link(s).`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not revoke links.", "error");
    } finally {
      setLinkBusy(null);
    }
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Drawer
        open={!!quote}
        onClose={onClose}
        data-testid="quote-detail-drawer"
        title={`${quote.quote_number || "Quote"} · ${quoteName(quote)}`}
        footer={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/print/quote/${quote.id}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="quote-print-link"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-cream"
            >
              <Printer className="h-4 w-4" /> PDF
            </a>
            {isDraft && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={!canWrite}
                title={disabledTitle}
                onClick={() => onEdit(quote)}
                data-testid="quote-edit-button"
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!canWrite || busy !== null}
              title={disabledTitle}
              loading={busy === "duplicate"}
              onClick={() => run("duplicate", () => duplicateQuote(quote.id))}
              data-testid="quote-duplicate-button"
            >
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            {canSend && (
              <Button
                variant="gold"
                disabled={!canWrite || busy !== null}
                title={disabledTitle}
                loading={busy === "send"}
                onClick={() => run("send", () => markQuoteSent(quote.id))}
                data-testid="quote-send-button"
              >
                <Send className="h-4 w-4" /> Send
              </Button>
            )}
            {canExpire && (
              <Button
                variant="subtle"
                disabled={!canWrite || busy !== null}
                title={disabledTitle}
                loading={busy === "expire"}
                onClick={() => run("expire", () => expireQuote(quote.id))}
                data-testid="quote-expire-button"
              >
                <Clock className="h-4 w-4" /> Expire
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                disabled={!canWrite || busy !== null}
                title={disabledTitle}
                onClick={() => setConfirmCancel(true)}
                data-testid="quote-cancel-button"
              >
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
            {quote.status === "accepted" && (
              <Button
                variant="navy"
                disabled={!canConvert}
                title={canConvert ? undefined : disabledTitle}
                onClick={() => setShowSchedule(true)}
                data-testid="quote-convert-button"
              >
                <Briefcase className="h-4 w-4" /> To Job
              </Button>
            )}
            {quote.status === "converted" && (
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard/jobs")}
                data-testid="quote-open-job-button"
              >
                <Briefcase className="h-4 w-4" /> View Job
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-md border border-slate-200 bg-cream-100 p-4">
            <Logo variant="dark" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gold/30 pt-2 text-xs text-muted">
              <span>{BRAND.phone}</span>
              <span>{BRAND.email}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <StatusBadge status={quote.status} label={quoteStatusLabel(quote.status)} />
            <span className="font-serif text-2xl font-bold text-navy">
              {formatCurrency(quote.total ?? quote.subtotal)}
            </span>
          </div>

          {canWrite && linkable && (
            <div className="rounded-md border border-slate-200 p-3" data-testid="approval-link-section">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Customer Approval Link
              </h4>
              {link ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={link.url}
                      data-testid="approval-link-url"
                      onFocus={(e) => e.currentTarget.select()}
                      className="text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyLink}
                      data-testid="copy-approval-link"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Expires {formatDate(link.expires)}. The raw link is shown once — copy it now.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Generate a secure link the customer can open to view and approve or decline this
                  quote — no account required. Creating a link marks the quote as Sent.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="gold"
                  loading={linkBusy === "create"}
                  onClick={createLink}
                  data-testid="create-approval-link"
                >
                  <Link2 className="h-3.5 w-3.5" /> {link ? "Regenerate" : "Create link"}
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  loading={linkBusy === "revoke"}
                  onClick={revokeLinks}
                  data-testid="revoke-approval-links"
                >
                  Revoke links
                </Button>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pricing
            </h4>
            <div className="rounded-md border border-slate-200">
              <PricingLine label="Hourly rate" value={formatCurrency(quote.hourly_rate)} />
              <PricingLine label="Estimated hours" value={String(quote.estimated_hours ?? "—")} />
              <PricingLine label="Travel fee" value={formatCurrency(quote.travel_fee)} />
              <PricingLine label="Packing fee" value={formatCurrency(quote.packing_fee)} />
              <PricingLine label="Materials fee" value={formatCurrency(quote.materials_fee)} />
              <PricingLine label="Discount" value={formatCurrency(quote.discount)} />
              <PricingLine label="Subtotal" value={formatCurrency(quote.subtotal)} />
              <PricingLine
                label={`Tax${quote.tax_rate ? ` (${quote.tax_rate}%)` : ""}`}
                value={formatCurrency(quote.tax)}
              />
              <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
                <span className="text-navy">Total</span>
                <span className="text-navy">{formatCurrency(quote.total ?? quote.subtotal)}</span>
              </div>
              {quote.deposit_amount ? (
                <div className="flex justify-between px-3 py-2 text-xs text-slate-500">
                  <span>Deposit ({quote.deposit_percent ?? 0}%)</span>
                  <span>{formatCurrency(quote.deposit_amount)}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Line Items
            </h4>
            {itemsLoading ? (
              <p className="text-sm text-slate-400">Loading items…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-400">No line items.</p>
            ) : (
              <div className="rounded-md border border-slate-200" data-testid="quote-line-items">
                {items.map((li, i) => (
                  <div
                    key={li.id ?? i}
                    className={`flex justify-between px-3 py-2 text-sm ${i > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <span className="text-slate-700">
                      {li.description}
                      <span className="ml-1 text-xs text-slate-400">
                        ({li.quantity} × {formatCurrency(li.unit_price)})
                      </span>
                    </span>
                    <span className="font-medium text-navy">
                      {formatCurrency(li.total ?? li.quantity * li.unit_price)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Meta label="Sent" value={formatDate(quote.sent_at)} />
            <Meta label="Accepted" value={formatDate(quote.accepted_at)} />
            <Meta label="Expires" value={formatDate(quote.expires_at)} />
            <Meta label="Created" value={formatDate(quote.created_at)} />
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          run("cancel", () => cancelQuote(quote.id));
        }}
        title="Cancel this quote?"
        description="The quote will be marked Cancelled. This does not delete it."
        confirmLabel="Cancel Quote"
      />

      <ScheduleJobDrawer
        open={showSchedule}
        quote={quote}
        onClose={() => setShowSchedule(false)}
        onConverted={() => {
          onChanged();
        }}
      />
    </>
  );
}

function PricingLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="font-medium text-navy">{value}</p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Schedule Job (quote -> job conversion)
// Calls ONLY the verified convert_quote_to_job RPC. Prefills date/addresses
// from the linked lead when available (editable). Idempotent success path.
// --------------------------------------------------------------------------

const EMPTY_SCHEDULE = {
  scheduled_start: "",
  scheduled_end: "",
  origin_address: "",
  destination_address: "",
  crew_size: "",
  truck_count: "",
  dispatch_notes: "",
};

function ScheduleJobDrawer({
  open,
  quote,
  onClose,
  onConverted,
}: {
  open: boolean;
  quote: QuoteRecord;
  onClose: () => void;
  onConverted: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_SCHEDULE });
  const [prefilling, setPrefilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [result, setResult] = useState<{ job_id: string; job_number: string; created: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_SCHEDULE });
    setResult(null);
    savingRef.current = false;
    setSaving(false);
    // Best-effort prefill from the linked lead.
    if (quote.lead_id) {
      setPrefilling(true);
      fetchLeadById(quote.lead_id)
        .then((lead) => {
          if (!lead) return;
          setForm((f) => ({
            ...f,
            scheduled_start: lead.move_date ? `${lead.move_date.slice(0, 10)}T09:00` : f.scheduled_start,
            origin_address: lead.origin_address ?? f.origin_address,
            destination_address: lead.destination_address ?? f.destination_address,
          }));
        })
        .catch(() => {})
        .finally(() => setPrefilling(false));
    }
  }, [open, quote.lead_id]);

  function upd<K extends keyof typeof EMPTY_SCHEDULE>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toIso(local: string): string | null {
    if (!local) return null;
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function validate(): string | null {
    if (!form.scheduled_start) return "Scheduled start is required.";
    const startIso = toIso(form.scheduled_start);
    if (!startIso) return "Scheduled start is not a valid date/time.";
    if (!form.origin_address.trim()) return "Origin address is required.";
    if (!form.destination_address.trim()) return "Destination address is required.";
    if (form.scheduled_end) {
      const endIso = toIso(form.scheduled_end);
      if (!endIso) return "Scheduled end is not a valid date/time.";
      if (new Date(endIso) <= new Date(startIso)) return "Scheduled end must be after scheduled start.";
    }
    if (form.crew_size && Number(form.crew_size) < 0) return "Crew size cannot be negative.";
    if (form.truck_count && Number(form.truck_count) < 0) return "Truck count cannot be negative.";
    return null;
  }

  async function submit() {
    if (savingRef.current) return;
    const err = validate();
    if (err) {
      toast(err, "error");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await convertQuoteToJob({
        quote_id: quote.id,
        scheduled_start: toIso(form.scheduled_start)!,
        origin_address: form.origin_address.trim(),
        destination_address: form.destination_address.trim(),
        scheduled_end: form.scheduled_end ? toIso(form.scheduled_end) : null,
        crew_size: form.crew_size ? Number(form.crew_size) : null,
        truck_count: form.truck_count ? Number(form.truck_count) : null,
        dispatch_notes: form.dispatch_notes.trim() || null,
      });
      // created=false means the quote was already converted — still a success.
      setResult(res);
      toast(
        res.created ? `Job ${res.job_number} created.` : `Quote already converted — opened ${res.job_number}.`,
        "success"
      );
      onConverted();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not convert quote to job.", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      data-testid="schedule-job-drawer"
      title={`Schedule Job · ${quote.quote_number || "Quote"}`}
      footer={
        result ? (
          <div className="flex gap-2">
            <Button
              variant="gold"
              className="flex-1"
              onClick={() => router.push("/dashboard/jobs")}
              data-testid="open-job-button"
            >
              <Briefcase className="h-4 w-4" /> Open Job
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="close-schedule-job">
              Close
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="gold"
              className="flex-1"
              loading={saving}
              onClick={submit}
              data-testid="submit-schedule-job"
            >
              <Briefcase className="h-4 w-4" /> Convert to Job
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="cancel-schedule-job">
              Cancel
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4" data-testid="schedule-job-success">
          <div className="flex flex-col items-center gap-2 rounded-md border border-green-200 bg-green-50 p-5 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <p className="text-sm text-slate-600">
              {result.created ? "This quote is now a scheduled job." : "This quote was already converted."}
            </p>
            <p className="font-serif text-2xl font-bold text-navy" data-testid="result-job-number">
              {result.job_number}
            </p>
          </div>
          <p className="text-center text-xs text-slate-400">
            The quote status is now <strong>Converted</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {prefilling && (
            <p className="text-xs text-slate-400">Prefilling from the linked lead…</p>
          )}
          <p className="text-xs text-slate-500">
            Confirm the schedule and route for this move. Fields prefill from the linked lead where
            available but remain editable — the server validates the final values.
          </p>

          <div>
            <Label>Scheduled start *</Label>
            <Input
              data-testid="schedule-start"
              type="datetime-local"
              value={form.scheduled_start}
              onChange={(e) => upd("scheduled_start", e.target.value)}
            />
          </div>

          <div>
            <Label>Scheduled end</Label>
            <Input
              data-testid="schedule-end"
              type="datetime-local"
              value={form.scheduled_end}
              onChange={(e) => upd("scheduled_end", e.target.value)}
            />
          </div>

          <div>
            <Label>Origin address *</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                data-testid="schedule-origin"
                placeholder="Pickup address"
                value={form.origin_address}
                onChange={(e) => upd("origin_address", e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div>
            <Label>Destination address *</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
              <Input
                data-testid="schedule-destination"
                placeholder="Drop-off address"
                value={form.destination_address}
                onChange={(e) => upd("destination_address", e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Crew size</Label>
              <Input
                data-testid="schedule-crew-size"
                type="number"
                min="0"
                step="1"
                placeholder="2"
                value={form.crew_size}
                onChange={(e) => upd("crew_size", e.target.value)}
              />
            </div>
            <div>
              <Label>Truck count</Label>
              <Input
                data-testid="schedule-truck-count"
                type="number"
                min="0"
                step="1"
                placeholder="1"
                value={form.truck_count}
                onChange={(e) => upd("truck_count", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Dispatch notes</Label>
            <textarea
              data-testid="schedule-dispatch-notes"
              rows={3}
              value={form.dispatch_notes}
              onChange={(e) => upd("dispatch_notes", e.target.value)}
              placeholder="Access, parking, elevator, fragile items…"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
