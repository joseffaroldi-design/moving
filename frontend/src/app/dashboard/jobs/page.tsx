"use client";

import { useMemo, useState } from "react";
import { Search, Plus, MapPin, Users, Truck } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, titleCase } from "@/lib/format";
import { jobCustomer, addr } from "@/lib/entities";
import type { Job } from "@/lib/types";

const TIMELINE = ["scheduled", "in_progress", "completed"];

export default function JobsPage() {
  const { data, loading, error, refetch } = useDashboardData();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Job | null>(null);

  const jobs = data?.upcomingJobs ?? [];
  const statuses = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.status).filter(Boolean))) as string[],
    [jobs]
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const matchesQuery =
        !query ||
        jobCustomer(j).toLowerCase().includes(query.toLowerCase()) ||
        String(j.job_number ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || j.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [jobs, query, status]);

  const activeStep = selected
    ? Math.max(0, TIMELINE.indexOf(String(selected.status ?? "").toLowerCase()))
    : 0;

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Scheduled and active moving jobs."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Jobs" }]}
        actions={
          <Button data-testid="new-job-button" onClick={() => toast("Create jobs by converting an approved quote.", "info")}>
            <Plus className="h-4 w-4" /> New Job
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="jobs-search"
            placeholder="Search by customer or job #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select data-testid="jobs-status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load jobs" message={error} onRetry={refetch} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No jobs found" description={jobs.length === 0 ? "Approved quotes become jobs here." : "Try adjusting your filters."} />
      ) : (
        <DataTable data-testid="jobs-table">
          <Thead>
            <Th>Job #</Th>
            <Th>Customer</Th>
            <Th>Scheduled</Th>
            <Th>Route</Th>
            <Th>Crew / Trucks</Th>
            <Th>Status</Th>
          </Thead>
          <Tbody>
            {filtered.map((j, i) => (
              <Tr key={(j.id as string) ?? i} data-testid={`job-row-${i}`} onClick={() => setSelected(j)}>
                <Td className="font-medium text-navy">{j.job_number || "—"}</Td>
                <Td>{jobCustomer(j)}</Td>
                <Td className="text-slate-500">{formatDate(j.scheduled_start as string)}</Td>
                <Td className="max-w-[220px] truncate text-slate-500">
                  {addr(j, "origin")} → {addr(j, "destination")}
                </Td>
                <Td className="text-slate-500">
                  {(j.crew_size ?? 0)} · {(j.truck_count ?? 0)}
                </Td>
                <Td><StatusBadge status={j.status as string} /></Td>
              </Tr>
            ))}
          </Tbody>
        </DataTable>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.job_number || "Job"} · ${jobCustomer(selected)}` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <StatusBadge status={selected.status as string} />

            {/* Timeline */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status Timeline</h4>
              <div className="flex items-center">
                {TIMELINE.map((step, i) => (
                  <div key={step} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i <= activeStep ? "bg-accent text-white" : "bg-slate-200 text-slate-500"}`}>
                        {i + 1}
                      </div>
                      <span className={`mt-1 text-[11px] ${i <= activeStep ? "text-navy" : "text-slate-400"}`}>
                        {titleCase(step)}
                      </span>
                    </div>
                    {i < TIMELINE.length - 1 && (
                      <div className={`mx-1 h-0.5 flex-1 ${i < activeStep ? "bg-accent" : "bg-slate-200"}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Scheduled Start" value={formatDateTime(selected.scheduled_start as string)} />
              <Info label="Scheduled End" value={formatDateTime(selected.scheduled_end as string)} />
              <Info label="Crew Size" value={String(selected.crew_size ?? "—")} icon={Users} />
              <Info label="Trucks" value={String(selected.truck_count ?? "—")} icon={Truck} />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-slate-500">Origin</p>
                  <p className="font-medium text-navy">{addr(selected, "origin")}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-accent" />
                <div>
                  <p className="text-slate-500">Destination</p>
                  <p className="font-medium text-navy">{addr(selected, "destination")}</p>
                </div>
              </div>
            </div>

            {selected.dispatch_notes ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Dispatch Notes</h4>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{String(selected.dispatch_notes)}</p>
              </div>
            ) : null}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Users }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </p>
      <p className="font-medium text-navy">{value}</p>
    </div>
  );
}
