"use client";

import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, Card, CardHeader } from "@/components/ui/card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Users, FileText, Briefcase, UserRound, TrendingUp, DollarSign, Truck, Target } from "lucide-react";

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

  const recentQuotes = data?.recentQuotes ?? [];
  const wonQuotes = recentQuotes.filter((q) =>
    ["approved", "accepted", "won"].includes(String(q.status ?? "").toLowerCase())
  );
  const openQuotes = recentQuotes.filter((q) =>
    !["approved", "accepted", "won", "rejected", "lost", "expired"].includes(
      String(q.status ?? "").toLowerCase()
    )
  );
  const totalQuoteValue = recentQuotes.reduce(
    (sum, q) => sum + (Number(q.total ?? q.subtotal) || 0),
    0
  );
  const wonQuoteValue = wonQuotes.reduce(
    (sum, q) => sum + (Number(q.total ?? q.subtotal) || 0),
    0
  );
  const openPipelineValue = openQuotes.reduce(
    (sum, q) => sum + (Number(q.total ?? q.subtotal) || 0),
    0
  );
  const avgQuoteValue = recentQuotes.length ? totalQuoteValue / recentQuotes.length : 0;
  const quoteWinRate = recentQuotes.length ? (wonQuotes.length / recentQuotes.length) * 100 : 0;
  const leadToQuoteRate = data?.counts.leads ? (data.counts.quotes / data.counts.leads) * 100 : 0;
  const quoteToJobRate = data?.counts.quotes ? (data.counts.jobs / data.counts.quotes) * 100 : 0;
  const jobsScheduled = data?.upcomingJobs.length ?? 0;
  const dispatched = data?.dispatchAssignments.length ?? 0;
  const dispatchCoverage = jobsScheduled ? Math.min(100, (dispatched / jobsScheduled) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sales, pipeline, and operations performance at a glance."
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

          {!loading && data && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <DollarSign className="h-4 w-4" /> Open pipeline
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{money(openPipelineValue)}</p>
                    <p className="mt-1 text-xs text-slate-500">Recent quotes still in play</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <TrendingUp className="h-4 w-4" /> Quote win rate
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{pct(quoteWinRate)}</p>
                    <p className="mt-1 text-xs text-slate-500">{wonQuotes.length} won of {recentQuotes.length} recent quotes</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <Target className="h-4 w-4" /> Average quote
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{money(avgQuoteValue)}</p>
                    <p className="mt-1 text-xs text-slate-500">Across recent quote activity</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <Truck className="h-4 w-4" /> Dispatch coverage
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold text-navy">{pct(dispatchCoverage)}</p>
                    <p className="mt-1 text-xs text-slate-500">{dispatched} assignments for {jobsScheduled} upcoming jobs</p>
                  </div>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Sales Funnel" />
                  <div className="space-y-5 p-6">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-600">Lead → Quote</span>
                        <span className="font-semibold text-navy">{pct(leadToQuoteRate)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, leadToQuoteRate)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-600">Quote → Job</span>
                        <span className="font-semibold text-navy">{pct(quoteToJobRate)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, quoteToJobRate)}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                      <div className="rounded-md bg-slate-50 p-3"><p className="text-2xl font-bold text-navy">{data.counts.leads}</p><p className="text-xs text-slate-500">Leads</p></div>
                      <div className="rounded-md bg-slate-50 p-3"><p className="text-2xl font-bold text-navy">{data.counts.quotes}</p><p className="text-xs text-slate-500">Quotes</p></div>
                      <div className="rounded-md bg-slate-50 p-3"><p className="text-2xl font-bold text-navy">{data.counts.jobs}</p><p className="text-xs text-slate-500">Jobs</p></div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Quote Value" />
                  <div className="space-y-4 p-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="text-sm text-slate-600">Recent quote value</span>
                      <span className="font-semibold text-navy">{money(totalQuoteValue)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="text-sm text-slate-600">Won quote value</span>
                      <span className="font-semibold text-navy">{money(wonQuoteValue)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <span className="text-sm text-slate-600">Open pipeline</span>
                      <span className="font-semibold text-navy">{money(openPipelineValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Average recent quote</span>
                      <span className="font-semibold text-navy">{money(avgQuoteValue)}</span>
                    </div>
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
