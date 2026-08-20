"use client";

import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, Card, CardHeader } from "@/components/ui/card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Users,
  FileText,
  Briefcase,
  UserRound,
  TrendingUp,
  DollarSign,
  Truck,
  Target,
  Clock3,
  Receipt,
} from "lucide-react";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

export default function ReportsPage() {
  const { data, loading, error, refetch } = useDashboardData();
  const r = data?.reporting;

  const quoteWinRate = r?.quotesDecidedCount
    ? (r.quotesWonCount / r.quotesDecidedCount) * 100
    : 0;
  const leadToQuoteRate = r?.leadCount
    ? (r.quotedLeadCount / r.leadCount) * 100
    : 0;
  const quoteToJobRate = r?.quotesSentCount
    ? (r.jobsFromQuotesCount / r.quotesSentCount) * 100
    : 0;
  const dispatchCoverage = r?.upcomingJobsCount
    ? Math.min(100, (r.dispatchedUpcomingJobsCount / r.upcomingJobsCount) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="The core sales, cash, labor, and operations numbers needed to run the business."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Reports" }]}
      />

      {error ? (
        <ErrorState title="Couldn't load reports" message={error} onRetry={refetch} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {loading || !data ? (
              Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard label="Total Leads" value={data.counts.leads} icon={Users} />
                <StatCard label="Total Customers" value={data.counts.customers} icon={UserRound} />
                <StatCard label="Quotes" value={data.counts.quotes} icon={FileText} />
                <StatCard label="Jobs" value={data.counts.jobs} icon={Briefcase} />
              </>
            )}
          </div>

          {!loading && data && r && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <DollarSign className="h-4 w-4" /> Open pipeline
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{money(r.openPipelineValue)}</p>
                    <p className="mt-1 text-xs text-slate-500">Sent or viewed quotes still in play</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <DollarSign className="h-4 w-4" /> Collected revenue
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{money(r.collectedRevenue)}</p>
                    <p className="mt-1 text-xs text-slate-500">Recorded invoice payments</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <Receipt className="h-4 w-4" /> Unpaid invoices
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{money(r.unpaidInvoiceBalance)}</p>
                    <p className="mt-1 text-xs text-slate-500">{r.unpaidInvoiceCount} invoice{r.unpaidInvoiceCount === 1 ? "" : "s"} with balance due</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <Clock3 className="h-4 w-4" /> Labor hours
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{r.laborHours.toFixed(1)}</p>
                    <p className="mt-1 text-xs text-slate-500">Completed crew clock entries</p>
                  </div>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Sales Funnel" />
                  <div className="space-y-5 p-6">
                    {[
                      ["Lead → Quote", leadToQuoteRate],
                      ["Quote → Job", quoteToJobRate],
                      ["Decided quote win rate", quoteWinRate],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-slate-600">{label}</span>
                          <span className="font-semibold text-navy">{pct(Number(value))}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Number(value))}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                      <div className="rounded-md bg-slate-50 p-3"><p className="text-2xl font-bold text-navy">{r.leadCount}</p><p className="text-xs text-slate-500">Leads</p></div>
                      <div className="rounded-md bg-slate-50 p-3"><p className="text-2xl font-bold text-navy">{r.quotesSentCount}</p><p className="text-xs text-slate-500">Quoted</p></div>
                      <div className="rounded-md bg-slate-50 p-3"><p className="text-2xl font-bold text-navy">{r.jobsFromQuotesCount}</p><p className="text-xs text-slate-500">Jobs</p></div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Operations & Margin" />
                  <div className="space-y-4 p-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="flex items-center gap-2 text-sm text-slate-600"><Target className="h-4 w-4" /> Average quote</span>
                      <span className="font-semibold text-navy">{money(r.averageQuoteValue)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="flex items-center gap-2 text-sm text-slate-600"><Truck className="h-4 w-4" /> Dispatch coverage</span>
                      <span className="font-semibold text-navy">{pct(dispatchCoverage)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="text-sm text-slate-600">Completed-job billed</span>
                      <span className="font-semibold text-navy">{money(r.completedJobBilled)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="text-sm text-slate-600">Recorded job expenses</span>
                      <span className="font-semibold text-navy">{money(r.completedJobExpenses)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><TrendingUp className="h-4 w-4" /> Basic job margin</span>
                      <span className="font-semibold text-navy">{money(r.basicJobMargin)}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Basic margin is completed-job invoice value minus recorded job expenses. Payroll/labor wage cost is intentionally excluded until real payroll usage is proven.
                    </p>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
