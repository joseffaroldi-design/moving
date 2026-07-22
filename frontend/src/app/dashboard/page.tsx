"use client";

import Link from "next/link";
import {
  Users,
  UserRound,
  FileText,
  Briefcase,
  CalendarClock,
  Truck,
  ArrowRight,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, Card, CardHeader } from "@/components/ui/card";
import { StatCardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { leadName, quoteCustomer, jobCustomer, addr } from "@/lib/entities";

export default function DashboardPage() {
  const { data, loading, error, refetch } = useDashboardData();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational snapshot of your moving business."
        breadcrumbs={[{ label: "Operations" }, { label: "Dashboard" }]}
      />

      {error ? (
        <ErrorState
          title="Couldn't load dashboard data"
          message={error}
          onRetry={refetch}
        />
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {loading || !data ? (
              Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard label="Customers" value={data.counts.customers} icon={UserRound} data-testid="stat-customers" />
                <StatCard label="Leads" value={data.counts.leads} icon={Users} data-testid="stat-leads" />
                <StatCard label="Quotes" value={data.counts.quotes} icon={FileText} data-testid="stat-quotes" />
                <StatCard label="Jobs" value={data.counts.jobs} icon={Briefcase} data-testid="stat-jobs" />
                <StatCard label="Dispatch" value={data.counts.dispatchAssignments} icon={CalendarClock} data-testid="stat-dispatch" />
                <StatCard label="Trucks" value={data.counts.trucks} icon={Truck} data-testid="stat-trucks" />
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent leads */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent Leads"
                action={
                  <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : data && data.recentLeads.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {data.recentLeads.slice(0, 6).map((lead, i) => (
                    <li key={(lead.id as string) ?? i} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">{leadName(lead)}</p>
                        <p className="truncate text-xs text-slate-500">
                          {addr(lead, "origin")} → {addr(lead, "destination")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 pl-3">
                        <span className="hidden text-xs text-slate-500 sm:block">
                          {formatDate(lead.move_date as string)}
                        </span>
                        <StatusBadge status={lead.status as string} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <EmptyState title="No recent leads" description="New leads will appear here as they come in." />
                </div>
              )}
            </Card>

            {/* Onboarding */}
            <Card>
              <CardHeader title="Company Setup" />
              <div className="p-4">
                {loading || !data ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : data.onboarding.steps.length > 0 ? (
                  <>
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-navy">Progress</span>
                        <span className="text-slate-500">
                          {data.onboarding.completed}/{data.onboarding.total}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{
                            width: `${data.onboarding.total ? (data.onboarding.completed / data.onboarding.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {data.onboarding.steps.slice(0, 6).map((s, i) => {
                        const done =
                          s.completed === true ||
                          s.is_complete === true ||
                          String(s.status ?? "").toLowerCase() === "completed";
                        const label =
                          (s.title as string) || (s.name as string) || (s.label as string) || `Step ${i + 1}`;
                        return (
                          <li key={i} className="flex items-center gap-2 py-1 text-sm">
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-slate-300" />
                            )}
                            <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>
                              {titleCase(label)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <EmptyState title="Setup complete" description="No pending onboarding steps." />
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent quotes */}
            <Card>
              <CardHeader
                title="Recent Quotes"
                action={
                  <Link href="/dashboard/quotes" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : data && data.recentQuotes.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {data.recentQuotes.slice(0, 5).map((q, i) => (
                    <li key={(q.id as string) ?? i} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">
                          {q.quote_number || `Quote`} · {quoteCustomer(q)}
                        </p>
                        <p className="text-xs text-slate-500">{formatCurrency(q.total ?? q.subtotal)}</p>
                      </div>
                      <StatusBadge status={q.status as string} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <EmptyState title="No recent quotes" />
                </div>
              )}
            </Card>

            {/* Upcoming jobs */}
            <Card>
              <CardHeader
                title="Upcoming Jobs"
                action={
                  <Link href="/dashboard/jobs" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : data && data.upcomingJobs.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {data.upcomingJobs.slice(0, 5).map((j, i) => (
                    <li key={(j.id as string) ?? i} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">
                          {j.job_number || "Job"} · {jobCustomer(j)}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {formatDate(j.scheduled_start as string)} · {addr(j, "origin")}
                        </p>
                      </div>
                      <StatusBadge status={j.status as string} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <EmptyState title="No upcoming jobs" />
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
