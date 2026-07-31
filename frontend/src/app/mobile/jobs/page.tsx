"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, ChevronRight, Briefcase, Phone, Users, Truck, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/AuthProvider";
import { CrewNotAuthorized } from "@/components/mobile/CrewStates";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  crewListJobs,
  jobStatusLabel,
  crewRoleLabel,
  isNotCrewError,
  crewErrorMessage,
  type CrewJobListItem,
  type CrewScope,
} from "@/lib/crew";

const TABS: { scope: CrewScope; label: string }[] = [
  { scope: "active", label: "Active" },
  { scope: "completed", label: "Completed" },
];

export default function MobileJobsPage() {
  const { loading: authLoading, session } = useAuth();
  const [scope, setScope] = useState<CrewScope>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCrew, setNotCrew] = useState(false);
  const [jobs, setJobs] = useState<CrewJobListItem[]>([]);

  const load = useCallback(async (s: CrewScope) => {
    setLoading(true);
    setError(null);
    setNotCrew(false);
    try {
      const res = await crewListJobs(s, 50, 0);
      setJobs(res.items);
    } catch (e) {
      if (isNotCrewError(e)) setNotCrew(true);
      else setError(crewErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && session) load(scope);
    else if (!authLoading && !session) setLoading(false);
  }, [authLoading, session, scope, load]);

  return (
    <div data-testid="crew-jobs">
      <h1 className="mb-3 font-heading text-xl font-bold text-navy">My Jobs</h1>

      <div className="mb-4 flex gap-1 rounded-md border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.scope}
            onClick={() => setScope(t.scope)}
            data-testid={`crew-tab-${t.scope}`}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-semibold transition-colors",
              scope === t.scope ? "bg-navy text-white" : "text-slate-500"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {authLoading || loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : notCrew ? (
        <CrewNotAuthorized />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(scope)} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={scope === "active" ? "No active jobs" : "No completed jobs"}
          description={
            scope === "active"
              ? "Jobs assigned to you will appear here."
              : "Your finished jobs will appear here."
          }
          data-testid="crew-jobs-empty"
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/mobile/jobs/${j.id}`}
              data-testid={`crew-job-${j.job_number}`}
              className="block rounded-md border border-slate-200 bg-white p-4 shadow-card active:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm font-bold text-navy">{j.job_number}</span>
                <StatusBadge status={j.status} label={jobStatusLabel(j.status)} />
              </div>

              {j.my_role && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gold-hover">
                  {crewRoleLabel(j.my_role)}
                </p>
              )}

              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" /> {formatDateTime(j.scheduled_start)}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" /> {j.origin_address || "—"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <ChevronRight className="h-3.5 w-3.5 text-gold-hover" /> {j.destination_address || "—"}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                {j.customer_name && <span className="font-medium text-slate-700">{j.customer_name}</span>}
                {j.customer_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {j.customer_phone}
                  </span>
                )}
                {j.crew_size != null && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {j.crew_size}
                  </span>
                )}
                {j.truck_count != null && (
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" /> {j.truck_count}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
