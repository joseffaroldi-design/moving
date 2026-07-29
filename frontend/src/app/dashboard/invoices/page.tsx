"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Receipt, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  fetchInvoices,
  invoiceStatusLabel,
  effectiveInvoiceStatus,
  invoiceCustomerName,
  isOverdue,
  canMutateInvoice,
  INVOICE_STATUSES,
  type InvoiceRecord,
} from "@/lib/invoices";
import { NewInvoiceFromJobDialog } from "@/components/invoices/NewInvoiceFromJobDialog";

export default function InvoicesPage() {
  const router = useRouter();
  const { me, role } = useAuth();
  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const canCreate = canMutateInvoice(role);

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInvoices(await fetchInvoices(companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesQuery =
        !query ||
        invoiceCustomerName(inv).toLowerCase().includes(query.toLowerCase()) ||
        String(inv.invoice_number ?? "").toLowerCase().includes(query.toLowerCase()) ||
        String(inv.jobs?.job_number ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus =
        status === "all" ||
        (status === "overdue" ? isOverdue(inv) : inv.status === status);
      return matchesQuery && matchesStatus;
    });
  }, [invoices, query, status]);

  return (
    <div>
      <PageHeader
        title="Invoices & Payments"
        description="Track billing, deposits, and outstanding balances."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Invoices" }]}
        actions={
          canCreate ? (
            <Button variant="gold" onClick={() => setNewOpen(true)} data-testid="new-invoice-button">
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="invoices-search"
            placeholder="Search by customer, invoice #, or job #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          data-testid="invoices-status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>{invoiceStatusLabel(s)}</option>
          ))}
          <option value="overdue">Overdue</option>
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load invoices" message={error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}
          description={
            invoices.length === 0
              ? "Invoices are created from completed jobs. Use “New invoice” to generate one."
              : "Try adjusting your search or status filter."
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable data-testid="invoices-table">
              <Thead>
                <Th>Invoice #</Th>
                <Th>Status</Th>
                <Th>Customer</Th>
                <Th>Job</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th>Total</Th>
                <Th>Balance</Th>
              </Thead>
              <Tbody>
                {filtered.map((inv, i) => (
                  <Tr
                    key={inv.id}
                    data-testid={`invoice-row-${i}`}
                    onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                  >
                    <Td className="font-medium text-navy">{inv.invoice_number}</Td>
                    <Td>
                      <StatusBadge
                        status={effectiveInvoiceStatus(inv)}
                        label={invoiceStatusLabel(effectiveInvoiceStatus(inv))}
                      />
                    </Td>
                    <Td>{invoiceCustomerName(inv)}</Td>
                    <Td className="text-slate-500">{inv.jobs?.job_number ?? "—"}</Td>
                    <Td className="text-slate-500">{formatDate(inv.sent_at)}</Td>
                    <Td className="text-slate-500">{formatDate(inv.due_date)}</Td>
                    <Td className="font-medium text-navy">{formatCurrency(inv.total)}</Td>
                    <Td className={Number(inv.balance) > 0 ? "font-medium text-red-600" : "text-slate-500"}>
                      {formatCurrency(inv.balance)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </DataTable>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((inv, i) => (
              <button
                key={inv.id}
                data-testid={`invoice-card-${i}`}
                onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-navy">{inv.invoice_number}</p>
                  <StatusBadge
                    status={effectiveInvoiceStatus(inv)}
                    label={invoiceStatusLabel(effectiveInvoiceStatus(inv))}
                  />
                </div>
                <p className="mt-1 text-sm text-slate-600">{invoiceCustomerName(inv)}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total {formatCurrency(inv.total)}</span>
                  <span className={Number(inv.balance) > 0 ? "font-medium text-red-600" : "text-slate-500"}>
                    Balance {formatCurrency(inv.balance)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {canCreate && companyId && (
        <NewInvoiceFromJobDialog
          open={newOpen}
          onClose={() => setNewOpen(false)}
          companyId={companyId}
          onCreated={(invoiceId) => {
            setNewOpen(false);
            router.push(`/dashboard/invoices/${invoiceId}`);
          }}
        />
      )}
    </div>
  );
}
