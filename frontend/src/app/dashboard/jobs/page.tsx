"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, Users, Truck, FileText } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  fetchJobs,
  jobStatusLabel,
  JOB_STATUSES,
  setJobStatus,
  forwardJobTransition,
  isTerminalJobStatus,
  canSetJobStatus,
  type JobRecord,
} from "@/lib/jobs";

const TIMELINE = ["scheduled", "confirmed", "in_progress", "completed"];

function jobCustomerName(j: JobRecord): string {
  const c = j.customers;
  if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer";
  return "Customer";
}

export default function JobsPage() {
  const { me, role } = useAuth();
  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const canManageStatus = canSetJobStatus(role);
  const toast = useToast();

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setJobs(await fetchJobs(companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const matchesQuery =
        !query ||
        jobCustomerName(j).toLowerCase().includes(query.toLowerCase()) ||
        String(j.job_number ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || j.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [jobs, query, status]);

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId]
  );

  const activeStep = selected
    ? Math.max(0, TIMELINE.indexOf(String(selected.status ?? "").toLowerCase()))
    : 0;

  const forward = selected ? forwardJobTransition(selected.status) : null;
  const canCancelJob = selected ? !isTerminalJobStatus(selected.status) : false;

  const changeStatus = useCallback(
    async (to: string) => {
      if (!selectedId || busyRef.current) return;
      busyRef.current = true;
      setStatusBusy(true);
      try {
        const res = await setJobStatus(selectedId, to);
        toast(
          res.changed ? `Job status set to ${jobStatusLabel(res.status)}.` : "Status already up to date.",
          "success"
        );
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update job status.", "error");
      } finally {
        busyRef.current = false;
        setStatusBusy(false);
      }
    },
    [selectedId, load, toast]
  );

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Scheduled and active moving jobs."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Jobs" }]}
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
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>{jobStatusLabel(s)}</option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load jobs" message={error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No jobs found"
          description={
            jobs.length === 0
              ? "Convert an approved quote into a job to get started."
              : "Try adjusting your filters."
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
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
                  <Tr key={j.id ?? i} data-testid={`job-row-${i}`} onClick={() => setSelectedId(j.id)}>
                    <Td className="font-medium text-navy">{j.job_number || "—"}</Td>
                    <Td>{jobCustomerName(j)}</Td>
                    <Td className="text-slate-500">{formatDateTime(j.scheduled_start)}</Td>
                    <Td className="max-w-[220px] truncate text-slate-500">
                      {j.origin_address || "—"} → {j.destination_address || "—"}
                    </Td>
                    <Td className="text-slate-500">
                      {(j.crew_size ?? "—")} · {(j.truck_count ?? "—")}
                    </Td>
                    <Td>
                      <StatusBadge status={j.status} label={jobStatusLabel(j.status)} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </DataTable>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((j, i) => (
              <button
                key={j.id ?? i}
                data-testid={`job-card-${i}`}
                onClick={() => setSelectedId(j.id)}
                className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-navy">{j.job_number || "—"}</p>
                  <StatusBadge status={j.status} label={jobStatusLabel(j.status)} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{jobCustomerName(j)}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(j.scheduled_start)}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        data-testid="job-detail-drawer"
        title={selected ? `${selected.job_number || "Job"} · ${jobCustomerName(selected)}` : ""}
        footer={
          selected && canManageStatus && !isTerminalJobStatus(selected.status) ? (
            <div className="flex flex-wrap gap-2" data-testid="job-status-actions">
              {forward && (
                <Button
                  variant="gold"
                  className="flex-1"
                  loading={statusBusy}
                  onClick={() => changeStatus(forward.to)}
                  data-testid="job-status-forward"
                >
                  {forward.label}
                </Button>
              )}
              {canCancelJob && (
                <Button
                  variant="danger"
                  disabled={statusBusy}
                  onClick={() => setConfirmCancel(true)}
                  data-testid="job-status-cancel"
                >
                  Cancel Job
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={selected.status} label={jobStatusLabel(selected.status)} />
              {selected.quote_id ? (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <FileText className="h-3.5 w-3.5" /> From quote
                </span>
              ) : null}
            </div>

            {/* Timeline */}
            {selected.status !== "cancelled" && (
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
                          {jobStatusLabel(step)}
                        </span>
                      </div>
                      {i < TIMELINE.length - 1 && (
                        <div className={`mx-1 h-0.5 flex-1 ${i < activeStep ? "bg-accent" : "bg-slate-200"}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Scheduled Start" value={formatDateTime(selected.scheduled_start)} />
              <Info label="Scheduled End" value={formatDateTime(selected.scheduled_end)} />
              <Info label="Crew Size" value={String(selected.crew_size ?? "—")} icon={Users} />
              <Info label="Trucks" value={String(selected.truck_count ?? "—")} icon={Truck} />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-slate-500">Origin</p>
                  <p className="font-medium text-navy">{selected.origin_address || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-accent" />
                <div>
                  <p className="text-slate-500">Destination</p>
                  <p className="font-medium text-navy">{selected.destination_address || "—"}</p>
                </div>
              </div>
            </div>

            {selected.dispatch_notes ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Dispatch Notes</h4>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{selected.dispatch_notes}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Created" value={formatDate(selected.created_at)} />
              <Info label="Updated" value={formatDate(selected.updated_at)} />
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          changeStatus("cancelled");
        }}
        title="Cancel this job?"
        description="The job will be marked Cancelled. This is a terminal state and cannot be undone from here."
        confirmLabel="Cancel Job"
      />
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
