"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Send, CheckCircle2, Briefcase } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { quoteCustomer } from "@/lib/entities";
import type { Quote } from "@/lib/types";

const MONEY_FIELDS: { key: keyof Quote; label: string }[] = [
  { key: "hourly_rate", label: "Hourly Rate" },
  { key: "estimated_hours", label: "Estimated Hours" },
  { key: "travel_fee", label: "Travel Fee" },
  { key: "packing_fee", label: "Packing Fee" },
  { key: "materials_fee", label: "Materials Fee" },
  { key: "discount", label: "Discount" },
  { key: "subtotal", label: "Subtotal" },
  { key: "tax", label: "Tax" },
];

export default function QuotesPage() {
  const { data, loading, error, refetch } = useDashboardData();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Quote | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);

  const quotes = data?.recentQuotes ?? [];
  const statuses = useMemo(
    () => Array.from(new Set(quotes.map((q) => q.status).filter(Boolean))) as string[],
    [quotes]
  );

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      const matchesQuery =
        !query ||
        quoteCustomer(q).toLowerCase().includes(query.toLowerCase()) ||
        String(q.quote_number ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || q.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [quotes, query, status]);

  const lineItems = (selected?.line_items ??
    selected?.quote_line_items ??
    []) as Record<string, unknown>[];

  return (
    <div>
      <PageHeader
        title="Quotes"
        description="Create, send, and approve moving estimates."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Quotes" }]}
        actions={
          <Button data-testid="new-quote-button" onClick={() => toast("Quote builder coming next.", "info")}>
            <Plus className="h-4 w-4" /> New Quote
          </Button>
        }
      />

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
        <Select data-testid="quotes-status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load quotes" message={error} onRetry={refetch} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No quotes found" description={quotes.length === 0 ? "Create a quote from a lead to get started." : "Try adjusting your filters."} />
      ) : (
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
              <Tr key={(q.id as string) ?? i} data-testid={`quote-row-${i}`} onClick={() => setSelected(q)}>
                <Td className="font-medium text-navy">{q.quote_number || "—"}</Td>
                <Td>{quoteCustomer(q)}</Td>
                <Td className="font-medium text-navy">{formatCurrency(q.total ?? q.subtotal)}</Td>
                <Td className="text-slate-500">{formatDate(q.sent_at as string)}</Td>
                <Td className="text-slate-500">{formatDate((q.expires_at || q.expiration_date) as string)}</Td>
                <Td><StatusBadge status={q.status as string} /></Td>
              </Tr>
            ))}
          </Tbody>
        </DataTable>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.quote_number || "Quote"} · ${quoteCustomer(selected)}` : ""}
        footer={
          selected && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="flex-1" onClick={() => toast("Quote sent to customer.", "success")}>
                <Send className="h-4 w-4" /> Send
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => toast("Quote approved.", "success")}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button variant="navy" onClick={() => setConfirmConvert(true)}>
                <Briefcase className="h-4 w-4" /> To Job
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={selected.status as string} />
              <span className="font-heading text-xl font-bold text-navy">
                {formatCurrency(selected.total ?? selected.subtotal)}
              </span>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Pricing</h4>
              <div className="rounded-md border border-slate-200">
                {MONEY_FIELDS.filter((f) => selected[f.key] !== undefined && selected[f.key] !== null).map((f, idx) => (
                  <div key={f.key as string} className={`flex justify-between px-3 py-2 text-sm ${idx > 0 ? "border-t border-slate-100" : ""}`}>
                    <span className="text-slate-500">{f.label}</span>
                    <span className="font-medium text-navy">
                      {f.key === "estimated_hours"
                        ? String(selected[f.key])
                        : formatCurrency(selected[f.key] as number)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
                  <span className="text-navy">Total</span>
                  <span className="text-navy">{formatCurrency(selected.total ?? selected.subtotal)}</span>
                </div>
              </div>
            </div>

            {lineItems.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Line Items</h4>
                <div className="rounded-md border border-slate-200">
                  {lineItems.map((li, i) => (
                    <div key={i} className={`flex justify-between px-3 py-2 text-sm ${i > 0 ? "border-t border-slate-100" : ""}`}>
                      <span className="text-slate-700">{String(li.description ?? li.name ?? "Item")}</span>
                      <span className="font-medium text-navy">{formatCurrency((li.amount ?? li.total ?? li.price) as number)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Sent</p>
                <p className="font-medium text-navy">{formatDate(selected.sent_at as string)}</p>
              </div>
              <div>
                <p className="text-slate-500">Accepted</p>
                <p className="font-medium text-navy">{formatDate(selected.accepted_at as string)}</p>
              </div>
              <div>
                <p className="text-slate-500">Expires</p>
                <p className="font-medium text-navy">{formatDate((selected.expires_at || selected.expiration_date) as string)}</p>
              </div>
              <div>
                <p className="text-slate-500">Created</p>
                <p className="font-medium text-navy">{formatDate(selected.created_at as string)}</p>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmConvert}
        onClose={() => setConfirmConvert(false)}
        onConfirm={() => {
          setConfirmConvert(false);
          toast("Job created from quote.", "success");
        }}
        title="Convert quote to job?"
        description="This creates a scheduled job from the accepted quote. You can assign trucks and crew in Dispatch."
        confirmLabel="Create Job"
      />
    </div>
  );
}
