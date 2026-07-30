"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, MapPin, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalNotCustomer } from "@/components/portal/PortalStates";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  portalListJobs,
  portalGetJob,
  jobStatusLabel,
  isNotCustomerError,
  safeErrorMessage,
  type PortalJobListItem,
  type PortalJobDetail,
} from "@/lib/portal";

const STAGES = ["scheduled", "confirmed", "in_progress", "completed"] as const;

function Timeline({ status }: { status: string }) {
  const idx = STAGES.indexOf(status as (typeof STAGES)[number]);
  if (status === "cancelled") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
        This move was cancelled.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {STAGES.map((s, i) => {
        const done = idx >= i;
        return (
          <div key={s} className="flex flex-1 flex-col items-center">
            <div
              className={`h-2 w-full rounded-full ${done ? "bg-gold" : "bg-slate-200"}`}
            />
            <span
              className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                done ? "text-navy" : "text-slate-400"
              }`}
            >
              {jobStatusLabel(s)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PortalJobs() {
  const { loading: authLoading, session } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCustomer, setNotCustomer] = useState(false);
  const [jobs, setJobs] = useState<PortalJobListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortalJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCustomer(false);
    try {
      const res = await portalListJobs(50, 0);
      setJobs(res.items);
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

  const openDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetail(null);
      setDetailLoading(true);
      try {
        setDetail(await portalGetJob(id));
      } catch (e) {
        toast(safeErrorMessage(e), "error");
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  return (
    <div data-testid="portal-jobs">
      <PageHeader
        title="My Move"
        breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "My Move" }]}
        description="Track the status and schedule of your move."
      />

      {authLoading || loading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : notCustomer ? (
        <PortalNotCustomer />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No moves scheduled yet"
          description="Once your move is booked, its schedule and status will show up here."
          data-testid="portal-jobs-empty"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {jobs.map((j) => (
            <button
              key={j.id}
              onClick={() => openDetail(j.id)}
              className="rounded-md border border-slate-200 bg-white p-4 text-left shadow-card transition-colors hover:border-gold"
              data-testid={`job-card-${j.job_number}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm font-semibold text-navy">
                  {j.job_number}
                </span>
                <StatusBadge status={j.status} label={jobStatusLabel(j.status)} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <CalendarClock className="h-4 w-4 text-slate-400" />
                {formatDateTime(j.scheduled_start)}
              </div>
              <div className="mt-1.5 flex items-start gap-2 text-xs text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>
                  {j.origin_address || "—"} → {j.destination_address || "—"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail ? `Move ${detail.job_number}` : "Move"}
        data-testid="job-detail-drawer"
      >
        {detailLoading || !detail ? (
          <TableSkeleton rows={3} cols={2} />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={detail.status} label={jobStatusLabel(detail.status)} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
                Status
              </p>
              <Timeline status={detail.status} />
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
                Schedule
              </p>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-slate-500">Start</span>
                <span className="font-medium text-navy">{formatDateTime(detail.scheduled_start)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-slate-500">End</span>
                <span className="font-medium text-navy">{formatDateTime(detail.scheduled_end)}</span>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">
                Route
              </p>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">From</p>
                  <p className="text-navy">{detail.origin_address || "—"}</p>
                </div>
              </div>
              <div className="mt-2 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-hover" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">To</p>
                  <p className="text-navy">{detail.destination_address || "—"}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
