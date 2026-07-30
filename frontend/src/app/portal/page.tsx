"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Receipt, CalendarClock, ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalNotCustomer } from "@/components/portal/PortalStates";
import { formatCurrency, formatDate } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import {
  portalListQuotes,
  portalListJobs,
  portalListInvoices,
  outstandingBalance,
  quoteLooksApprovable,
  quoteStatusLabel,
  invoiceStatusLabel,
  jobStatusLabel,
  isNotCustomerError,
  safeErrorMessage,
  type PortalQuoteListItem,
  type PortalJobListItem,
  type PortalInvoiceListItem,
} from "@/lib/portal";

export default function PortalHome() {
  const { loading: authLoading, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCustomer, setNotCustomer] = useState(false);
  const [quotes, setQuotes] = useState<PortalQuoteListItem[]>([]);
  const [jobs, setJobs] = useState<PortalJobListItem[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoiceListItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCustomer(false);
    try {
      const [q, j, i] = await Promise.all([
        portalListQuotes(5, 0),
        portalListJobs(100, 0),
        portalListInvoices(100, 0),
      ]);
      setQuotes(q.items);
      setJobs(j.items);
      setInvoices(i.items);
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

  const outstanding = outstandingBalance(invoices);
  const awaiting = quotes.filter(quoteLooksApprovable).length;
  const now = Date.now();
  const upcoming =
    jobs
      .filter((j) => j.scheduled_start && new Date(j.scheduled_start).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime()
      )[0] ?? null;
  const recentInvoices = invoices.slice(0, 5);
  const isEmpty = quotes.length === 0 && jobs.length === 0 && invoices.length === 0;

  return (
    <div data-testid="portal-overview">
      <PageHeader
        title={BRAND.welcome}
        description="Review your quotes, track your move, and view invoices — all in one place."
      />

      {authLoading || loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : notCustomer ? (
        <PortalNotCustomer />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Outstanding balance"
              value={formatCurrency(outstanding)}
              icon={Receipt}
              hint={outstanding > 0 ? "View payments to see details" : "You're all paid up"}
              data-testid="stat-outstanding"
            />
            <StatCard
              label="Quotes to review"
              value={awaiting}
              icon={FileText}
              hint={awaiting > 0 ? "Awaiting your approval" : "Nothing to approve"}
              data-testid="stat-awaiting-quotes"
            />
            <StatCard
              label="Next move"
              value={upcoming ? formatDate(upcoming.scheduled_start) : "—"}
              icon={CalendarClock}
              hint={upcoming ? jobStatusLabel(upcoming.status) : "None scheduled"}
              data-testid="stat-next-move"
            />
          </div>

          {isEmpty ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing here just yet"
              description={`Once ${BRAND.short} shares a quote or schedules your move, it will appear here. Questions? Call or text ${BRAND.phone}.`}
              data-testid="portal-overview-empty"
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card data-testid="upcoming-move-card">
                <CardHeader
                  title="Your move"
                  action={
                    <Link
                      href="/portal/jobs"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gold-hover hover:underline"
                      data-testid="view-all-jobs"
                    >
                      All moves <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                <div className="p-4">
                  {upcoming ? (
                    <Link
                      href="/portal/jobs"
                      className="block rounded-md border border-slate-200 p-3 transition-colors hover:border-gold"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-heading text-sm font-semibold text-navy">
                          {upcoming.job_number}
                        </span>
                        <StatusBadge status={upcoming.status} label={jobStatusLabel(upcoming.status)} />
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(upcoming.scheduled_start)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {upcoming.origin_address || "—"} → {upcoming.destination_address || "—"}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-sm text-slate-500">No upcoming move scheduled.</p>
                  )}
                </div>
              </Card>

              <Card data-testid="recent-quotes-card">
                <CardHeader
                  title="Recent quotes"
                  action={
                    <Link
                      href="/portal/quotes"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gold-hover hover:underline"
                      data-testid="view-all-quotes"
                    >
                      All quotes <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                <div className="divide-y divide-slate-100">
                  {quotes.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No quotes yet.</p>
                  ) : (
                    quotes.map((q) => (
                      <Link
                        key={q.id}
                        href="/portal/quotes"
                        className="flex items-center justify-between px-4 py-3 hover:bg-cream"
                      >
                        <div>
                          <p className="text-sm font-medium text-navy">{q.quote_number}</p>
                          <p className="text-xs text-slate-500">{formatDate(q.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-navy">
                            {formatCurrency(q.total)}
                          </span>
                          <StatusBadge status={q.status} label={quoteStatusLabel(q.status)} />
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </Card>

              <Card className="lg:col-span-2" data-testid="recent-invoices-card">
                <CardHeader
                  title="Recent invoices"
                  action={
                    <Link
                      href="/portal/payments"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gold-hover hover:underline"
                      data-testid="view-all-invoices"
                    >
                      All payments <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                <div className="divide-y divide-slate-100">
                  {recentInvoices.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No invoices yet.</p>
                  ) : (
                    recentInvoices.map((inv) => (
                      <Link
                        key={inv.id}
                        href="/portal/payments"
                        className="flex items-center justify-between px-4 py-3 hover:bg-cream"
                      >
                        <div>
                          <p className="text-sm font-medium text-navy">{inv.invoice_number}</p>
                          <p className="text-xs text-slate-500">Due {formatDate(inv.due_date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-navy">
                            {formatCurrency(inv.balance)}
                          </span>
                          <StatusBadge status={inv.status} label={invoiceStatusLabel(inv.status)} />
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
