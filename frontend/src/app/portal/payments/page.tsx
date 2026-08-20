"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt, Printer, Phone, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalNotCustomer } from "@/components/portal/PortalStates";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { PAYMENTS_ENABLED, startPortalPaymentCheckout } from "@/lib/payments";
import {
  portalListInvoices,
  portalGetInvoice,
  outstandingBalance,
  isPortalOverdue,
  invoiceStatusLabel,
  isNotCustomerError,
  safeErrorMessage,
  type PortalInvoiceListItem,
  type PortalInvoiceDetail,
} from "@/lib/portal";

function effectiveStatus(inv: { status: string; due_date: string | null; balance: number | null }): string {
  return isPortalOverdue({ status: inv.status, due_date: inv.due_date, balance: Number(inv.balance) })
    ? "overdue"
    : inv.status;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}

export default function PortalPayments() {
  const { loading: authLoading, session } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCustomer, setNotCustomer] = useState(false);
  const [invoices, setInvoices] = useState<PortalInvoiceListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortalInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCustomer(false);
    try {
      const res = await portalListInvoices(50, 0);
      setInvoices(res.items);
    } catch (e) {
      if (isNotCustomerError(e)) setNotCustomer(true);
      else setError(safeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && session) load();
    else if (!authLoading && !session) setLoading(false);
  }, [authLoading, session, load]);

  useEffect(() => {
    if (authLoading || !session || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (!payment) return;
    if (payment === "success") {
      toast("Payment received. Your balance will update as soon as the payment is confirmed.", "success");
      void load();
    } else if (payment === "cancelled") {
      toast("Payment checkout was cancelled. No charge was made.", "info");
    }
    params.delete("payment");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [authLoading, session, toast, load]);

  const openDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetail(null);
      setDetailLoading(true);
      try {
        setDetail(await portalGetInvoice(id));
      } catch (e) {
        toast(safeErrorMessage(e), "error");
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  async function handleInvoicePayment(invoiceId: string) {
    setPayingInvoiceId(invoiceId);
    try {
      await startPortalPaymentCheckout("invoice", invoiceId);
    } catch (e) {
      toast(safeErrorMessage(e), "error");
      setPayingInvoiceId(null);
    }
  }

  const outstanding = outstandingBalance(invoices);
  const firstPayable = invoices.find(
    (inv) => Number(inv.balance) > 0 && ["sent", "partially_paid", "overdue"].includes(effectiveStatus(inv))
  );
  const selectedPayable = detail
    ? Number(detail.balance) > 0 && ["sent", "partially_paid", "overdue"].includes(effectiveStatus(detail))
    : false;

  return (
    <div data-testid="portal-payments">
      <PageHeader
        title="Payments"
        breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Payments" }]}
        description="View your invoices, balances, and payment history."
      />

      {authLoading || loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : notCustomer ? (
        <PortalNotCustomer />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Your invoices and payment history will appear here after your move is scheduled or completed."
          data-testid="portal-payments-empty"
        />
      ) : (
        <div className="space-y-4">
          {outstanding > 0 && (
            <Card className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center" data-testid="outstanding-banner">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-hover">
                  Total outstanding
                </p>
                <p className="font-heading text-2xl font-bold text-navy">
                  {formatCurrency(outstanding)}
                </p>
              </div>
              {PAYMENTS_ENABLED && firstPayable ? (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => handleInvoicePayment(firstPayable.id)}
                  disabled={payingInvoiceId === firstPayable.id}
                  data-testid="pay-invoice-online"
                >
                  <CreditCard className="h-4 w-4" />
                  {payingInvoiceId === firstPayable.id ? "Opening checkout…" : "Pay online"}
                </Button>
              ) : (
                <a href={BRAND.phoneHref} data-testid="contact-to-pay">
                  <Button variant="gold" size="sm">
                    <Phone className="h-4 w-4" /> Contact us to arrange payment
                  </Button>
                </a>
              )}
            </Card>
          )}

          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Invoice</th>
                  <th className="px-4 py-2.5 font-semibold">Issued</th>
                  <th className="px-4 py-2.5 font-semibold">Due</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const st = effectiveStatus(inv);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => openDetail(inv.id)}
                      className="cursor-pointer hover:bg-cream"
                      data-testid={`invoice-row-${inv.invoice_number}`}
                    >
                      <td className="px-4 py-3 font-medium text-navy">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.sent_at)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">
                        {formatCurrency(inv.balance)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={st} label={invoiceStatusLabel(st)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {invoices.map((inv) => {
              const st = effectiveStatus(inv);
              return (
                <button
                  key={inv.id}
                  onClick={() => openDetail(inv.id)}
                  className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card"
                  data-testid={`invoice-card-${inv.invoice_number}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-navy">{inv.invoice_number}</span>
                    <StatusBadge status={st} label={invoiceStatusLabel(st)} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Due {formatDate(inv.due_date)}</span>
                    <span className="font-semibold text-navy">{formatCurrency(inv.balance)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail ? `Invoice ${detail.invoice_number}` : "Invoice"}
        data-testid="invoice-detail-drawer"
        footer={
          detail ? (
            <div className="flex items-center justify-between gap-2">
              <a
                href={`/print/portal/invoice/${detail.id}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="invoice-print-link"
              >
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </a>
              {selectedPayable && (
                PAYMENTS_ENABLED ? (
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => handleInvoicePayment(detail.id)}
                    disabled={payingInvoiceId === detail.id}
                    data-testid="pay-balance-button"
                  >
                    <CreditCard className="h-4 w-4" />
                    {payingInvoiceId === detail.id ? "Opening checkout…" : "Pay balance"}
                  </Button>
                ) : (
                  <a href={BRAND.phoneHref}>
                    <Button variant="gold" size="sm">
                      <Phone className="h-4 w-4" /> Arrange payment
                    </Button>
                  </a>
                )
              )}
            </div>
          ) : null
        }
      >
        {detailLoading || !detail ? (
          <TableSkeleton rows={3} cols={2} />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge
                status={effectiveStatus(detail)}
                label={invoiceStatusLabel(effectiveStatus(detail))}
              />
              <span className="text-xs text-slate-500">Issued {formatDate(detail.sent_at)}</span>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
                Charges
              </p>
              {detail.line_items.map((li, i) => (
                <Row
                  key={i}
                  label={`${li.description} (${li.quantity} × ${formatCurrency(li.unit_price)})`}
                  value={formatCurrency(li.total)}
                />
              ))}
              <div className="my-2 border-t border-slate-100" />
              <Row label="Subtotal" value={formatCurrency(detail.subtotal)} />
              {detail.tax ? <Row label={`Tax (${detail.tax_rate ?? 0}%)`} value={formatCurrency(detail.tax)} /> : null}
              <div className="mt-2 flex justify-between rounded-md bg-navy px-3 py-2 text-sm font-bold text-white">
                <span>Total</span>
                <span>{formatCurrency(detail.total)}</span>
              </div>
              {Number(detail.amount_paid) > 0 && (
                <Row label="Amount paid" value={`− ${formatCurrency(detail.amount_paid)}`} />
              )}
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold">
                <span className="text-slate-700">Balance due</span>
                <span className={Number(detail.balance) > 0 ? "text-red-600" : "text-emerald-700"}>
                  {formatCurrency(detail.balance)}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
                Payment history
              </p>
              {detail.payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="rounded-md border border-slate-200">
                  {detail.payments.map((p, i) => (
                    <div
                      key={i}
                      className={`flex justify-between px-3 py-2 text-sm ${
                        i > 0 ? "border-t border-slate-100" : ""
                      }`}
                    >
                      <span className="text-slate-600">
                        {formatDateTime(p.paid_at)} · {titleCase(p.method)}
                      </span>
                      <span className="font-medium text-navy">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              {PAYMENTS_ENABLED
                ? "Secure online card payment is available for outstanding invoices."
                : `Online payment isn't available yet. To pay, please call or text ${BRAND.phone}.`}
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
