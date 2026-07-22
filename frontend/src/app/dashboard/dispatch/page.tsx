"use client";

import { useMemo, useState } from "react";
import { Truck, User, Clock, GripVertical, PackageCheck } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatTime } from "@/lib/format";
import { jobCustomer, addr } from "@/lib/entities";
import type { DispatchAssignment, Job } from "@/lib/types";

type AnyObj = Record<string, unknown>;

function embeddedJob(a: DispatchAssignment): AnyObj | undefined {
  const j = (a as AnyObj).jobs ?? (a as AnyObj).job;
  return j && typeof j === "object" ? (j as AnyObj) : undefined;
}
function embeddedTruck(a: DispatchAssignment): AnyObj | undefined {
  const t = (a as AnyObj).trucks ?? (a as AnyObj).truck;
  return t && typeof t === "object" ? (t as AnyObj) : undefined;
}
function jobNumberOf(x: AnyObj | undefined): string | undefined {
  return x?.job_number as string | undefined;
}

export default function DispatchPage() {
  const { data, loading, error, refetch } = useDashboardData();
  const toast = useToast();
  const [day, setDay] = useState("today");

  const assignments = data?.dispatchAssignments ?? [];
  const jobs = data?.upcomingJobs ?? [];
  const fleet = data?.trucks ?? [];

  // Assignments embed the job/truck. Match to the full job (with addresses) by number.
  const assignedJobNumbers = useMemo(
    () =>
      new Set(
        assignments
          .map((a) => jobNumberOf(embeddedJob(a)))
          .filter(Boolean) as string[]
      ),
    [assignments]
  );
  const unassigned = useMemo(
    () => jobs.filter((j) => !assignedJobNumbers.has(j.job_number as string)),
    [jobs, assignedJobNumbers]
  );

  function fullJob(a: DispatchAssignment): Job | undefined {
    const num = jobNumberOf(embeddedJob(a));
    return jobs.find((j) => j.job_number === num);
  }

  return (
    <div>
      <PageHeader
        title="Dispatch"
        description="Assign trucks and crews across the day board."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Dispatch" }]}
        actions={
          <Select data-testid="dispatch-day-selector" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="week">This Week</option>
          </Select>
        }
      />

      {error ? (
        <ErrorState title="Couldn't load dispatch board" message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Assigned board */}
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title={`Assigned Runs · ${formatDate(new Date())}`} />
              {assignments.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={PackageCheck} title="No assignments yet" description="Assign an unassigned job to a truck and crew to build the day board." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assignments.map((a, i) => {
                    const ej = embeddedJob(a);
                    const et = embeddedTruck(a);
                    const job = fullJob(a);
                    const number = (jobNumberOf(ej) as string) || "Job";
                    const customer = job ? jobCustomer(job) : "";
                    const truckName = (et?.name || et?.license_plate) as string | undefined;
                    return (
                      <div key={(a.id as string) ?? i} data-testid={`assignment-row-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy text-xs font-bold text-white">
                          {(a.route_order as number) ?? i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-navy">
                            {number}{customer ? ` · ${customer}` : ""}
                          </p>
                          {job && (
                            <p className="truncate text-xs text-slate-500">
                              {addr(job, "origin")} → {addr(job, "destination")}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />{truckName || "Unassigned truck"}</span>
                            {a.crew_lead ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{String(a.crew_lead)}</span> : null}
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(a.start_window as string)} – {formatTime(a.end_window as string)}</span>
                          </div>
                          {a.dispatcher_notes ? (
                            <p className="mt-1 truncate text-[11px] italic text-slate-400">{String(a.dispatcher_notes)}</p>
                          ) : null}
                        </div>
                        <StatusBadge status={(a.status as string) || "assigned"} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar: unassigned + fleet */}
          <div className="space-y-4">
            <Card>
              <CardHeader title={`Unassigned Jobs (${unassigned.length})`} />
              {unassigned.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="All jobs assigned" description="Every upcoming job has a run." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {unassigned.map((j, i) => (
                    <button
                      key={(j.id as string) ?? i}
                      data-testid={`unassigned-job-${i}`}
                      onClick={() => toast("Assignment flow uses the assign-dispatch function (auth required).", "info")}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy">
                          {j.job_number || "Job"} · {jobCustomer(j)}
                        </p>
                        <p className="truncate text-xs text-slate-500">{formatDate(j.scheduled_start as string)}</p>
                      </div>
                      <StatusBadge status={j.status as string} />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title={`Fleet (${data?.counts.trucks ?? fleet.length})`} />
              {fleet.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Truck} title="Fleet list unavailable" description="Truck details load on the authenticated dispatch view." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {fleet.map((t, i) => (
                    <div key={(t.id as string) ?? i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-navy">
                          {(t.name || t.label || t.license_plate) as string}
                        </span>
                      </div>
                      <StatusBadge status={(t.status as string) || "available"} tone={t.status ? undefined : "success"} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
