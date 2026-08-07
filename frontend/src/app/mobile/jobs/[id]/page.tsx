"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Users,
  Truck,
  Clock,
  ClipboardList,
  UserRound,
  Camera,
  CheckSquare,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/AuthProvider";
import { CrewNotAuthorized } from "@/components/mobile/CrewStates";
import { formatDateTime } from "@/lib/format";
import {
  crewGetJob,
  jobStatusLabel,
  crewRoleLabel,
  isNotCrewError,
  crewErrorMessage,
  type CrewJobDetail,
} from "@/lib/crew";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">{title}</p>
      {children}
    </div>
  );
}

export default function MobileJobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { loading: authLoading, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCrew, setNotCrew] = useState(false);
  const [job, setJob] = useState<CrewJobDetail | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotCrew(false);
    try {
      setJob(await crewGetJob(id));
    } catch (e) {
      if (isNotCrewError(e)) setNotCrew(true);
      else setError(crewErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading && session) load();
    else if (!authLoading && !session) setLoading(false);
  }, [authLoading, session, load]);

  return (
    <div data-testid="crew-job-detail">
      <Link href="/mobile/jobs" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy" data-testid="crew-job-back">
        <ArrowLeft className="h-4 w-4" /> My Jobs
      </Link>

      {authLoading || loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : notCrew ? (
        <CrewNotAuthorized />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !job ? (
        <ErrorState message="This job could not be loaded." onRetry={load} />
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <span className="font-heading text-lg font-bold text-navy">{job.job_number}</span>
              <StatusBadge status={job.status} label={jobStatusLabel(job.status)} />
            </div>
            {job.my_role && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gold-hover">{crewRoleLabel(job.my_role)}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><Clock className="h-4 w-4 text-slate-400" /> {formatDateTime(job.scheduled_start)}</p>
            {job.scheduled_end && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" /> Ends {formatDateTime(job.scheduled_end)}</p>}
            <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2 text-xs text-slate-500">
              {job.crew_size != null && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {job.crew_size} crew</span>}
              {job.truck_count != null && <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {job.truck_count} truck{job.truck_count === 1 ? "" : "s"}</span>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2" data-testid="crew-job-actions">
            <Link href={`/mobile/clock?job=${id}`} className="flex min-h-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-center shadow-card active:bg-slate-50">
              <Clock className="h-5 w-5 text-gold-hover" />
              <span className="mt-1 text-xs font-semibold text-navy">Time Clock</span>
            </Link>
            <Link href={`/mobile/checklists?job=${id}`} className="flex min-h-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-center shadow-card active:bg-slate-50">
              <CheckSquare className="h-5 w-5 text-gold-hover" />
              <span className="mt-1 text-xs font-semibold text-navy">Checklist</span>
            </Link>
            <Link href={`/mobile/photos?job=${id}`} className="flex min-h-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-center shadow-card active:bg-slate-50">
              <Camera className="h-5 w-5 text-gold-hover" />
              <span className="mt-1 text-xs font-semibold text-navy">Photos</span>
            </Link>
          </div>

          <Section title="Route">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Pickup</p><p className="text-navy">{job.origin_address || "—"}</p></div>
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-hover" />
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Dropoff</p><p className="text-navy">{job.destination_address || "—"}</p></div>
            </div>
          </Section>

          <Section title="Customer">
            <p className="text-sm font-medium text-navy">{job.customer_name || "—"}</p>
            {job.customer_phone && (
              <a href={`tel:${job.customer_phone.replace(/[^\d+]/g, "")}`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-hover" data-testid="crew-call-customer">
                <Phone className="h-4 w-4" /> {job.customer_phone}
              </a>
            )}
          </Section>

          {job.dispatch_notes && (
            <Section title="Dispatch notes">
              <p className="flex items-start gap-2 text-sm text-slate-700"><ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="whitespace-pre-wrap">{job.dispatch_notes}</span></p>
            </Section>
          )}

          <Section title="Crew">
            {job.crew.length === 0 ? (
              <p className="text-sm text-slate-500">No crew assigned.</p>
            ) : (
              <ul className="space-y-2">
                {job.crew.map((m) => (
                  <li key={m.profile_id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white"><UserRound className="h-3.5 w-3.5" /></span>
                    <span className={m.is_me ? "font-semibold text-navy" : "text-slate-700"}>{m.name || "Crew member"}{m.is_me && " (You)"}</span>
                    <span className="ml-auto text-xs text-slate-400">{crewRoleLabel(m.role)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
