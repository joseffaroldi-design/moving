"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Printer, CheckCircle2, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalNotCustomer } from "@/components/portal/PortalStates";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  getPortalDepositState,
  PAYMENTS_ENABLED,
  startPortalPaymentCheckout,
  type PortalDepositState,
} from "@/lib/payments";
import {
  portalListQuotes,
  portalGetQuote,
  portalApproveQuote,
  quoteLooksApprovable,
  quoteStatusLabel,
  isNotCustomerError,
  safeErrorMessage,
  type PortalQuoteListItem,
  type PortalQuoteDetail,
} from "@/lib/portal";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}

export default function PortalQuotes() {
  const { loading: authLoading, session } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCustomer, setNotCustomer] = useState(false);
  const [quotes, setQuotes] = useState<PortalQuoteListItem[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortalQuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [depositState, setDepositState] = useState<PortalDepositState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCustomer(false);
    try {
      const res = await portalListQuotes(50, 0);
      setQuotes(res.items);
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

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDepositState(null);
    setDetailLoading(true);
    try {
      const quote = await portalGetQuote(id);
      setDetail(quote);
      if (
        PAYMENTS_ENABLED &&
        ["accepted", "converted"].includes(quote.status) &&
        Number(quote.deposit_amount) > 0
      ) {
        setDepositState(await getPortalDepositState(id));
      }
    } catch (e) {
      toast(safeErrorMessage(e), "error");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  async function handleApprove() {
    if (!detail) return;
    setApproving(true);
    try {
      const res = await portalApproveQuote(detail.id);
      if (res.approved) {
        toast("Quote approved — thank you! We'll be in touch to confirm your move.", "success");
      } else if (res.status === "expired") {
        toast("This quote has expired. Please contact us for an updated quote.", "info");
      } else {
        toast("This quote is no longer awaiting your decision.", "info");
      }
      setConfirmOpen(false);
      await Promise.all([load(), openDetail(detail.id)]);
    } catch (e) {
      toast(safeErrorMessage(e), "error");
    } finally {
      setApproving(false);
    }
  }

  async function handleDepositPayment() {
    if (!detail) return;
    setPaying(true);
    try {
      await startPortalPaymentCheckout("deposit", detail.id);
    } catch (e) {
      toast(safeErrorMessage(e), "error");
      setPaying(false);
    }
  }

  const canApprove = detail ? quoteLooksApprovable(detail) : false;
  const canPayDeposit = Boolean(
    PAYMENTS_ENABLED &&
    detail &&
    ["accepted", "converted"].includes(detail.status) &&
    Number(detail.deposit_amount) > 0 &&
    depositState?.paid !== true
  );

  return (
    <div data-testid="portal-quotes">
      <PageHeader
        title="Your Quotes"
        breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Quotes" }]}
        description="Review your moving estimates and approve the one that works for you."
      />

      {authLoading || loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : notCustomer ? (
        <PortalNotCustomer />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          description="Quotes shared with you will appear here. We'll email you when a new estimate is ready."
          data-testid="portal-quotes-empty"
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Quote</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Expires</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => openDetail(q.id)}
                    className="cursor-pointer hover:bg-cream"
                    data-testid={`quote-row-${q.quote_number}`}
                  >
                    <td className="px-4 py-3 font-medium text-navy">{q.quote_number}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(q.created_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(q.expires_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy">
                      {formatCurrency(q.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={q.status} label={quoteStatusLabel(q.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {quotes.map((q) => (
              <button
                key={q.id}
                onClick={() => openDetail(q.id)}
                className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card"
                data-testid={`quote-card-${q.quote_number}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-navy">{q.quote_number}</span>
                  <StatusBadge status={q.status} label={quoteStatusLabel(q.status)} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{formatDate(q.created_at)}</span>
                  <span className="font-semibold text-navy">{formatCurrency(q.total)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail ? `Quote ${detail.quote_number}` : "Quote"}
        data-testid="quote-detail-drawer"
        footer={
          detail ? (
            <div className="flex items-center justify-between gap-2">
              <a
                href={`/print/portal/quote/${detail.id}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="quote-print-link"
              >
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </a>
              {canApprove ? (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  data-testid="quote-approve-button"
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve quote
                </Button>
              ) : canPayDeposit ? (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleDepositPayment}
                  disabled={paying}
                  data-testid="pay-deposit-button"
                >
                  <CreditCard className="h-4 w-4" /> {paying ? "Opening checkout…" : "Pay deposit"}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">
            <TableSkeleton rows={3} cols={2} />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={detail.status} label={quoteStatusLabel(detail.status)} />
              <span className="text-xs text-slate-500">
                Issued {formatDate(detail.created_at)}
              </span>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
                Estimate
              </p>
              {detail.hourly_rate != null && (
                <Row label="Hourly rate" value={formatCurrency(detail.hourly_rate)} />
              )}
              {detail.estimated_hours != null && (
                <Row label="Estimated hours" value={String(detail.estimated_hours)} />
              )}
              {detail.travel_fee ? <Row label="Travel fee" value={formatCurrency(detail.travel_fee)} /> : null}
              {detail.packing_fee ? <Row label="Packing fee" value={formatCurrency(detail.packing_fee)} /> : null}
              {detail.materials_fee ? <Row label="Materials fee" value={formatCurrency(detail.materials_fee)} /> : null}
              {detail.line_items.map((li, i) => (
                <Row
                  key={i}
                  label={`${li.description} (${li.quantity} × ${formatCurrency(li.unit_price)})`}
                  value={formatCurrency(li.total)}
                />
              ))}
              {detail.discount ? <Row label="Discount" value={`− ${formatCurrency(detail.discount)}`} /> : null}
              <div className="my-2 border-t border-slate-100" />
              <Row label="Subtotal" value={formatCurrency(detail.subtotal)} />
              {detail.tax ? <Row label={`Tax (${detail.tax_rate ?? 0}%)`} value={formatCurrency(detail.tax)} /> : null}
              <div className="mt-2 flex justify-between rounded-md bg-navy px-3 py-2 text-sm font-bold text-white">
                <span>Total</span>
                <span>{formatCurrency(detail.total)}</span>
              </div>
              {detail.deposit_amount ? (
                <p className="mt-2 text-xs text-slate-500">
                  {depositState?.paid ? "Deposit paid" : "Deposit due"}
                  {detail.deposit_percent ? ` (${detail.deposit_percent}%)` : ""}:{" "}
                  <span className="font-semibold text-navy">
                    {formatCurrency(detail.deposit_amount)}
                  </span>
                </p>
              ) : null}
            </div>

            {detail.expires_at && (
              <p className="text-xs text-slate-500">
                Valid until {formatDate(detail.expires_at)}.
              </p>
            )}
            {!canApprove && detail.status !== "accepted" && detail.status !== "converted" && (
              <p className="text-xs text-slate-500">
                This quote isn&apos;t currently awaiting your approval.
              </p>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleApprove}
        loading={approving}
        title="Approve this quote?"
        description={`By approving quote ${detail?.quote_number ?? ""}, you accept the estimate shown. We'll follow up to confirm your move details.`}
        confirmLabel="Yes, approve"
      />
    </div>
  );
}
