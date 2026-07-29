"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Send, DollarSign, Ban, Printer } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";
import {
  fetchInvoiceById,
  fetchInvoiceLineItems,
  fetchInvoicePayments,
  invoiceStatusLabel,
  effectiveInvoiceStatus,
  invoiceCustomerName,
  canMutateInvoice,
  markInvoiceSent,
  voidInvoice,
  type InvoiceRecord,
  type InvoiceLineItem,
  type InvoicePayment,
} from "@/lib/invoices";
import { InvoiceEditorDrawer } from "@/components/invoices/InvoiceEditorDrawer";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const { role } = useAuth();
  const canMutate = canMutateInvoice(role);
  const toast = useToast();

  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await fetchInvoiceById(id);
      if (!inv) {
        setInvoice(null);
        setError("This invoice could not be found, or you don't have access to it.");
        return;
      }
      const [items, pays] = await Promise.all([
        fetchInvoiceLineItems(id),
        fetchInvoicePayments(id),
      ]);
      setInvoice(inv);
      setLineItems(items);
      setPayments(pays);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const status = invoice?.status;
  const canEdit = canMutate && status === "draft";
  const canSend = canMutate && status === "draft";
  const canPay = canMutate && (status === "sent" || status === "partially_paid");
  const canVoid = canMutate && status !== "paid" && status !== "void";

  const send = useCallback(async () => {
    if (!invoice || busy) return;
    setBusy(true);
    try {
      await markInvoiceSent(invoice.id);
      toast("Invoice marked as sent.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send the invoice.", "error");
    } finally {
      setBusy(false);
    }
  }, [invoice, busy, load, toast]);

  const doVoid = useCallback(async () => {
    if (!invoice || busy) return;
    setBusy(true);
    try {
      await voidInvoice(invoice.id);
      toast("Invoice voided.", "success");
      setConfirmVoid(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not void the invoice.", "error");
    } finally {
      setBusy(false);
    }
  }, [invoice, busy, load, toast]);

  const eff = useMemo(() => (invoice ? effectiveInvoiceStatus(invoice) : ""), [invoice]);

  return (
    <div>
      <Link
        href="/dashboard/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:text-gold-hover"
        data-testid="invoice-back-link"
      >
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Link>

      {error ? (
        <ErrorState title="Couldn't load invoice" message={error} onRetry={load} />
      ) : loading || !invoice ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="space-y-6" data-testid="invoice-detail">
          {/* Header + actions */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-serif text-2xl font-bold text-navy sm:text-[28px]">
                  {invoice.invoice_number}
                </h1>
                <StatusBadge status={eff} label={invoiceStatusLabel(eff)} data-testid="invoice-status-badge" />
              </div>
              <p className="mt-1 text-sm text-slate-500">{invoiceCustomerName(invoice)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-testid="invoice-actions">
              {canEdit && (
                <Button variant="outline" onClick={() => setEditOpen(true)} disabled={busy} data-testid="invoice-edit-button">
                  <Pencil className="h-4 w-4" /> Edit draft
                </Button>
              )}
              {canSend && (
                <Button variant="gold" onClick={send} loading={busy} data-testid="invoice-send-button">
                  <Send className="h-4 w-4" /> Mark as sent
                </Button>
              )}
              {canPay && (
                <Button variant="primary" onClick={() => setPayOpen(true)} disabled={busy} data-testid="invoice-record-payment-button">
                  <DollarSign className="h-4 w-4" /> Record payment
                </Button>
              )}
              <Link href={`/print/invoice/${invoice.id}`} target="_blank" data-testid="invoice-print-link">
                <Button variant="subtle">
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </Link>
              {canVoid && (
                <Button variant="danger" onClick={() => setConfirmVoid(true)} disabled={busy} data-testid="invoice-void-button">
                  <Ban className="h-4 w-4" /> Void
                </Button>
              )}
            </div>
          </div>

          {!canMutate && (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500" data-testid="invoice-readonly-note">
              You have read-only access to invoices. Changes require an owner, operations manager, or sales role.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: line items + payments */}
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader title="Line items" />
                <div className="divide-y divide-slate-100">
                  {lineItems.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No line items.</p>
                  ) : (
                    lineItems.map((li, i) => (
                      <div key={li.id ?? i} className="flex items-center justify-between px-4 py-2.5 text-sm" data-testid={`invoice-line-${i}`}>
                        <div>
                          <p className="font-medium text-navy">{li.description}</p>
                          <p className="text-xs text-slate-500">{li.quantity} × {formatCurrency(li.unit_price)}</p>
                        </div>
                        <span className="font-medium text-navy">{formatCurrency(li.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Payment history" />
                <div className="divide-y divide-slate-100">
                  {payments.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No payments recorded yet.</p>
                  ) : (
                    payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm" data-testid={`invoice-payment-${p.id}`}>
                        <div>
                          <p className="font-medium text-navy">{formatCurrency(p.amount)}</p>
                          <p className="text-xs text-slate-500">
                            {titleCase(p.method)} · {formatDateTime(p.paid_at)}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Right: totals + meta */}
            <div className="space-y-6">
              <Card>
                <CardHeader title="Summary" />
                <div className="space-y-1 p-4 text-sm">
                  <Row label="Subtotal" value={formatCurrency(invoice.subtotal)} />
                  <Row label={`Tax (${invoice.tax_rate}%)`} value={formatCurrency(invoice.tax)} />
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-navy">
                    <span>Total</span>
                    <span data-testid="invoice-total">{formatCurrency(invoice.total)}</span>
                  </div>
                  <Row label="Amount paid" value={formatCurrency(invoice.amount_paid)} />
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                    <span className="text-slate-600">Balance due</span>
                    <span className={Number(invoice.balance) > 0 ? "text-red-600" : "text-emerald-600"} data-testid="invoice-balance">
                      {formatCurrency(invoice.balance)}
                    </span>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Details" />
                <div className="space-y-3 p-4 text-sm">
                  <Row label="Issued" value={formatDate(invoice.sent_at)} />
                  <Row label="Due date" value={formatDate(invoice.due_date)} />
                  <Row label="Job" value={invoice.jobs?.job_number ?? "—"} />
                  <Row label="Created" value={formatDate(invoice.created_at)} />
                  {invoice.customers?.email && <Row label="Email" value={invoice.customers.email} />}
                  {invoice.customers?.phone && <Row label="Phone" value={invoice.customers.phone} />}
                </div>
              </Card>

              {invoice.notes && (
                <Card>
                  <CardHeader title="Notes" />
                  <p className="p-4 text-sm text-slate-600">{invoice.notes}</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {invoice && (
        <>
          <InvoiceEditorDrawer
            open={editOpen}
            onClose={() => setEditOpen(false)}
            invoice={invoice}
            lineItems={lineItems}
            onSaved={() => {
              setEditOpen(false);
              load();
            }}
          />
          <RecordPaymentDialog
            open={payOpen}
            onClose={() => setPayOpen(false)}
            invoiceId={invoice.id}
            balance={Number(invoice.balance) || 0}
            onRecorded={() => {
              setPayOpen(false);
              load();
            }}
          />
          <ConfirmDialog
            open={confirmVoid}
            onClose={() => setConfirmVoid(false)}
            onConfirm={doVoid}
            loading={busy}
            variant="danger"
            title="Void this invoice?"
            description="Voiding is permanent. A paid invoice cannot be voided. This does not delete recorded payments."
            confirmLabel="Void invoice"
          />
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}
