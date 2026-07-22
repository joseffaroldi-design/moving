"use client";

import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, Card, CardHeader } from "@/components/ui/card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Users, FileText, Briefcase, UserRound } from "lucide-react";

export default function ReportsPage() {
  const { data, loading, error, refetch } = useDashboardData();

  const wonQuotes = (data?.recentQuotes ?? []).filter((q) =>
    ["approved", "accepted", "won"].includes(String(q.status ?? "").toLowerCase())
  ).length;
  const totalQuoteValue = (data?.recentQuotes ?? []).reduce(
    (sum, q) => sum + (Number(q.total ?? q.subtotal) || 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Pipeline and conversion at a glance."
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
                <StatCard label="Quotes Won" value={wonQuotes} icon={FileText} hint={`of ${data.counts.quotes} quotes`} />
                <StatCard label="Active Jobs" value={data.counts.jobs} icon={Briefcase} />
              </>
            )}
          </div>

          <Card>
            <CardHeader title="Pipeline Value" />
            <div className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total value of recent quotes
              </p>
              <p className="mt-1 font-heading text-4xl font-bold text-navy">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalQuoteValue)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Advanced reporting (revenue trends, crew utilization, close rates) is
                on the roadmap.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
