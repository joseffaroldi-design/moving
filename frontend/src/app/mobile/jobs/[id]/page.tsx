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
  Navigation,
  MapPinned,
  Play,
  FileSignature,
  CircleCheck,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { CrewNotAuthorized } from "@/components/mobile/CrewStates";
import { formatDateTime } from "@/lib/format";
import {
  crewGetJob,
  crewGetMoveDayReadiness,
  crewUpdateMoveDayStatus,
  jobStatusLabel,
  crewRoleLabel,
  isNotCrewError,
  crewErrorMessage,
  type CrewJobDetail,
  type CrewMoveDayReadiness,
  type CrewMoveDayStatus,
} from "@/lib/crew";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-hover">{title}</p>
      {children}
    </div>
  );
}

const MOVE_ACTIONS: Array<{
  status: CrewMoveDayStatus;
  label: string;
  icon: React.ElementType;
}> = [
  { status: "en_route", label: "En Route", icon: Navigation },
  { status: "arrived", label: "Arrived", icon: MapPinned },
  { status: "loading", label: "Start Move", icon: Play },
  { status: "in_transit", label: "In Transit", icon: Truck },
  { status: "unloading", label: "Unloading", icon: Truck },
];

export default function MobileJobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { loading: authLoading, session } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCrew, setNotCrew] = useState(false);
  const [job, setJob] = useState<CrewJobDetail | null>(null);
  const [readiness, setReadiness] = useState<CrewMoveDayReadiness | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const refreshReadiness = useCallback(async () => {
    if (!id) return;
    try {
      setReadiness(await crewGetMoveDayReadiness(id));
    } catch {
      setReadiness(null);
    }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotCrew(false);
    try {
      setJob(await crewGetJob(id));
      await refreshReadiness();
    } catch (e) {
      if (isNotCrewError(e)) setNotCrew(true);
      else setError(crewErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, refreshReadiness]);

  useEffect(() => {
    if (!authLoading && session) void load();
    else if (!authLoading && !session) setLoading(false);
  }, [authLoading, session, load]);

  async function setMoveStatus(status: CrewMoveDayStatus) {
    if (!id || actionBusy) return;
    setActionBusy(status);
    try {
      await crewUpdateMoveDayStatus(id, status);
      toast(
        status === "completed"
          ? "Move completed."
          : `Move status updated: ${status.replaceAll("_", " ")}.`,
        "success"
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to update move status.", "error");
      await refreshReadiness();
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div data-testid="crew-job-detail">
      <Link
        href="/mobile/jobs"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy"
        data-testid="crew-job-back"
      >
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
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-lg font-bold text-navy">{job.job_number}</span>
              <StatusBadge status={job.status} label={jobStatusLabel(job.status)} />
            </div>
            {job.my_role && (
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gold-hover">
                {crewRoleLabel(job.my_role)}
              </p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <Clock className="h-4 w-4 text-slate-400" /> {formatDateTime(job.scheduled_start)}
            </p>
            {job.scheduled_end && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" /> Ends {formatDateTime(job.scheduled_end)}
              </p>
            )}
            <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2 text-xs text-slate-500">
              {job.crew_size != null && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {job.crew_size} crew
                </span>
              )}
              {job.truck_count != null && (
                <span className="flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5" /> {job.truck_count} truck{job.truck_count === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          <Section title="Move day">
            <div className="grid grid-cols-2 gap-2" data-testid="crew-move-day-actions">
              {MOVE_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.status}
                    variant="outline"
                    className="min-h-12 justify-start"
                    disabled={Boolean(actionBusy) || job.status === "completed" || job.status === "cancelled"}
                    onClick={() => void setMoveStatus(action.status)}
                    data-testid={`crew-status-${action.status}`}
                  >
                    <Icon className="h-4 w-4" />
                    {actionBusy === action.status ? "Updating…" : action.label}
                  </Button>
                );
              })}
            </div>

            <Link
              href={`/mobile/documents?job=${id}`}
              className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-200 text-sm font-semibold text-navy"
              data-testid="crew-job-documents"
            >
              <FileSignature className="h-4 w-4" /> Required Documents
            </Link>

            {readiness && job.status !== "completed" && job.status !== "cancelled" && (
              <div
                className={`mt-3 rounded-md border p-3 text-sm ${
                  readiness.ready
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
                data-testid="crew-completion-readiness"
              >
                <p className="flex items-center gap-2 font-semibold">
                  <CircleCheck className="h-4 w-4" />
                  {readiness.ready ? "Ready to complete" : "Completion requirements"}
                </p>
                {!readiness.ready && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {readiness.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {job.status !== "completed" && job.status !== "cancelled" && (
              <>
                <Button
                  variant="navy"
                  size="lg"
                  className="mt-3 w-full"
                  disabled={Boolean(actionBusy) || !readiness?.ready || job.my_role !== "crew_lead"}
                  onClick={() => void setMoveStatus("completed")}
                  data-testid="crew-complete-move"
                >
                  <CircleCheck className="h-5 w-5" />
                  {actionBusy === "completed" ? "Completing…" : "Complete Move"}
                </Button>
                {job.my_role !== "crew_lead" && (
                  <p className="mt-2 text-center text-xs text-slate-500">
                    Only the crew lead can complete the move.
                  </p>
                )}
              </>
            )}
          </Section>

          <div className="grid grid-cols-3 gap-2" data-testid="crew-job-actions">
            <Link
              href={`/mobile/clock?job=${id}`}
              className="flex min-h-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-center shadow-card active:bg-slate-50"
            >
              <Clock className="h-5 w-5 text-gold-hover" />
              <span className="mt-1 text-xs font-semibold text-navy">Time Clock</span>
            </Link>
            <Link
              href={`/mobile/checklists?job=${id}`}
              className="flex min-h-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-center shadow-card active:bg-slate-50"
            >
              <CheckSquare className="h-5 w-5 text-gold-hover" />
              <span className="mt-1 text-xs font-semibold text-navy">Checklist</span>
            </Link>
            <Link
              href={`/mobile/photos?job=${id}`}
              className="flex min-h-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-center shadow-card active:bg-slate-50"
            >
              <Camera className="h-5 w-5 text-gold-hover" />
              <span className="mt-1 text-xs font-semibold text-navy">Photos</span>
            </Link>
          </div>

          <Section title="Route">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Pickup</p>
                <p className="break-words text-navy">{job.origin_address || "—"}</p>
              </div>
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-hover" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Dropoff</p>
                <p className="break-words text-navy">{job.destination_address || "—"}</p>
              </div>
            </div>
          </Section>

          <Section title="Customer">
            <p className="text-sm font-medium text-navy">{job.customer_name || "—"}</p>
            {job.customer_phone && (
              <a
                href={`tel:${job.customer_phone.replace(/[^\d+]/g, "")}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-hover"
                data-testid="crew-call-customer"
              >
                <Phone className="h-4 w-4" /> {job.customer_phone}
              </a>
            )}
          </Section>

          {job.dispatch_notes && (
            <Section title="Dispatch notes">
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="whitespace-pre-wrap">{job.dispatch_notes}</span>
              </p>
            </Section>
          )}

          <Section title="Crew">
            {job.crew.length === 0 ? (
              <p className="text-sm text-slate-500">No crew assigned.</p>
            ) : (
              <ul className="space-y-2">
                {job.crew.map((member) => (
                  <li key={member.profile_id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-white">
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                    <span className={member.is_me ? "font-semibold text-navy" : "text-slate-700"}>
                      {member.name || "Crew member"}{member.is_me && " (You)"}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">{crewRoleLabel(member.role)}</span>
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
