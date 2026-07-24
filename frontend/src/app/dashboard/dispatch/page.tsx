"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Truck, User, Clock, MapPin, PackageCheck, Pencil, Plus, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatTime } from "@/lib/format";
import { fetchJobs, jobStatusLabel, type JobRecord } from "@/lib/jobs";
import {
  fetchTrucks,
  fetchCompanyMembers,
  fetchAssignmentsForDate,
  fetchJobCrew,
  fetchJobTrucks,
  assignJobToDispatch,
  setJobCrew,
  setJobTrucks,
  canDispatch,
  type TruckRecord,
  type MemberRecord,
  type DispatchAssignmentRow,
} from "@/lib/dispatch";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function jobCustomerName(j: JobRecord): string {
  const c = j.customers;
  if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer";
  return "Customer";
}

export default function DispatchPage() {
  const { me, role } = useAuth();
  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const canWrite = canDispatch(role);
  const toast = useToast();

  const [date, setDate] = useState(todayIso());
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [assignments, setAssignments] = useState<DispatchAssignmentRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ job: JobRecord; assignment: DispatchAssignmentRow | null } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [j, a, t, m] = await Promise.all([
        fetchJobs(companyId),
        fetchAssignmentsForDate(companyId, date),
        fetchTrucks(companyId),
        fetchCompanyMembers(companyId),
      ]);
      setJobs(j);
      setAssignments(a);
      setTrucks(t);
      setMembers(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dispatch board.");
    } finally {
      setLoading(false);
    }
  }, [companyId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const assignedJobIds = useMemo(() => new Set(assignments.map((a) => a.job_id)), [assignments]);
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const unassigned = useMemo(
    () =>
      jobs.filter(
        (j) => !["completed", "cancelled"].includes(j.status) && !assignedJobIds.has(j.id)
      ),
    [jobs, assignedJobIds]
  );

  const memberName = useCallback(
    (id: string | null) => (id ? members.find((m) => m.id === id)?.display_name ?? "—" : "—"),
    [members]
  );

  return (
    <div>
      <PageHeader
        title="Dispatch"
        description="Assign trucks and crews across the day board."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Dispatch" }]}
        actions={
          <Input
            data-testid="dispatch-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
            className="w-auto"
          />
        }
      />

      {!canWrite && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="dispatch-readonly-banner">
          <AlertTriangle className="h-4 w-4" /> You have read-only access to the dispatch board.
        </div>
      )}

      {error ? (
        <ErrorState title="Couldn't load dispatch board" message={error} onRetry={load} />
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
              <CardHeader title={`Assigned Runs · ${formatDate(date)}`} />
              {assignments.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={PackageCheck} title="No assignments yet" description="Assign an unassigned job to build the day board." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assignments.map((a, i) => {
                    const job = jobsById.get(a.job_id);
                    const customer = job ? jobCustomerName(job) : "";
                    return (
                      <div key={a.id ?? i} data-testid={`assignment-row-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy text-xs font-bold text-white">
                          {a.route_order ?? i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-navy">
                            {a.jobs?.job_number || job?.job_number || "Job"}{customer ? ` · ${customer}` : ""}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {a.jobs?.origin_address || job?.origin_address || "—"} → {a.jobs?.destination_address || job?.destination_address || "—"}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />{a.trucks?.name || "No primary truck"}</span>
                            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{memberName(a.crew_lead_id)}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{a.start_window ? formatTime(a.start_window) : "—"} – {a.end_window ? formatTime(a.end_window) : "—"}</span>
                          </div>
                        </div>
                        <StatusBadge status={a.status || "assigned"} />
                        {canWrite && job && (
                          <Button size="sm" variant="outline" onClick={() => setEditing({ job, assignment: a })} data-testid={`assignment-edit-${i}`}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader title={`Unassigned Jobs (${unassigned.length})`} />
              {unassigned.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="All jobs assigned" description="Every active job has a run for this date." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {unassigned.map((j, i) => (
                    <div key={j.id ?? i} data-testid={`unassigned-job-${i}`} className="flex items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy">{j.job_number || "Job"} · {jobCustomerName(j)}</p>
                        <p className="truncate text-xs text-slate-500">{formatDate(j.scheduled_start)}</p>
                      </div>
                      <StatusBadge status={j.status} label={jobStatusLabel(j.status)} />
                      {canWrite && (
                        <Button size="sm" variant="gold" onClick={() => setEditing({ job: j, assignment: null })} data-testid={`assign-job-${i}`}>
                          <Plus className="h-3.5 w-3.5" /> Assign
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title={`Fleet (${trucks.length})`} />
              {trucks.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Truck} title="No trucks" description="Add trucks to your fleet to assign them." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {trucks.map((t, i) => (
                    <div key={t.id ?? i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-navy">{t.name}</span>
                        {t.license_plate ? <span className="text-xs text-slate-400">{t.license_plate}</span> : null}
                      </div>
                      <StatusBadge status={t.is_active ? "active" : "inactive"} tone={t.is_active ? "success" : undefined} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {editing && (
        <AssignmentDrawer
          open={!!editing}
          job={editing.job}
          assignment={editing.assignment}
          boardDate={date}
          trucks={trucks}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Assignment / Edit drawer — mirrors the Schedule Job drawer pattern.
// Uses ONLY assign_job_to_dispatch, set_job_crew, set_job_trucks.
// --------------------------------------------------------------------------
function AssignmentDrawer({
  open,
  job,
  assignment,
  boardDate,
  trucks,
  members,
  onClose,
  onSaved,
}: {
  open: boolean;
  job: JobRecord;
  assignment: DispatchAssignmentRow | null;
  boardDate: string;
  trucks: TruckRecord[];
  members: MemberRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [dispatchDate, setDispatchDate] = useState(boardDate);
  const [startWindow, setStartWindow] = useState("");
  const [endWindow, setEndWindow] = useState("");
  const [truckId, setTruckId] = useState(""); // primary truck
  const [crewLeadId, setCrewLeadId] = useState(""); // crew lead
  const [routeOrder, setRouteOrder] = useState("");
  const [notes, setNotes] = useState("");
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [truckIds, setTruckIds] = useState<Set<string>>(new Set()); // all trucks
  const [prefilling, setPrefilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeTrucks = useMemo(() => trucks.filter((t) => t.is_active), [trucks]);
  const activeMembers = useMemo(() => members.filter((m) => m.is_active), [members]);

  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toIso = (local: string) => {
    if (!local) return null;
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    savingRef.current = false;
    setSaving(false);
    setDispatchDate(assignment?.dispatch_days?.dispatch_date ?? boardDate);
    setStartWindow(toLocal(assignment?.start_window ?? null));
    setEndWindow(toLocal(assignment?.end_window ?? null));
    setTruckId(assignment?.truck_id ?? "");
    setCrewLeadId(assignment?.crew_lead_id ?? "");
    setRouteOrder(assignment?.route_order != null ? String(assignment.route_order) : "");
    setNotes(assignment?.dispatcher_notes ?? "");

    setPrefilling(true);
    Promise.all([fetchJobCrew(job.id), fetchJobTrucks(job.id)])
      .then(([crew, jt]) => {
        setRosterIds(new Set(crew.map((c) => c.profile_id)));
        setTruckIds(new Set(jt.map((t) => t.truck_id)));
      })
      .catch(() => {})
      .finally(() => setPrefilling(false));
  }, [open, assignment, boardDate, job.id]);

  function toggleRoster(id: string) {
    setRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleTruck(id: string) {
    setTruckIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (savingRef.current) return;
    setFormError(null);
    if (!dispatchDate) {
      setFormError("Dispatch date is required.");
      return;
    }
    if (startWindow && endWindow) {
      const s = toIso(startWindow);
      const e = toIso(endWindow);
      if (s && e && new Date(e) <= new Date(s)) {
        setFormError("End window must be after start window.");
        return;
      }
    }
    // Ensure the crew lead is in the roster and the primary truck in the list.
    const roster = new Set(rosterIds);
    if (crewLeadId) roster.add(crewLeadId);
    const allTrucks = new Set(truckIds);
    if (truckId) allTrucks.add(truckId);

    savingRef.current = true;
    setSaving(true);
    try {
      // 1) Assignment first (records day/window/lead/primary truck + conflict checks).
      await assignJobToDispatch({
        job_id: job.id,
        dispatch_date: dispatchDate,
        truck_id: truckId || null,
        crew_lead_id: crewLeadId || null,
        start_window: startWindow ? toIso(startWindow) : null,
        end_window: endWindow ? toIso(endWindow) : null,
        route_order: routeOrder ? Number(routeOrder) : null,
        dispatcher_notes: notes.trim() || null,
      });
      // 2) Full roster (RPC re-asserts the lead as crew_lead).
      const memberPayload = Array.from(roster).map((id) => ({
        profile_id: id,
        role: id === crewLeadId ? "crew_lead" : "mover",
      }));
      await setJobCrew(job.id, memberPayload);
      // 3) Full truck list (RPC re-asserts the primary truck).
      await setJobTrucks(job.id, Array.from(allTrucks));

      toast(`Job ${job.job_number} assigned for ${formatDate(dispatchDate)}.`, "success");
      onSaved();
    } catch (e) {
      // Preserve entered form data so the dispatcher can correct it.
      setFormError(e instanceof Error ? e.message : "Could not save assignment.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      data-testid="assignment-drawer"
      title={`${assignment ? "Edit" : "Assign"} · ${job.job_number || "Job"}`}
      footer={
        <div className="flex gap-2">
          <Button variant="gold" className="flex-1" loading={saving} onClick={submit} data-testid="assignment-submit">
            {assignment ? "Save Assignment" : "Assign Job"}
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="assignment-cancel">
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {formError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="assignment-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}
        {prefilling && <p className="text-xs text-slate-400">Loading current crew &amp; trucks…</p>}

        <p className="text-xs text-slate-500">
          <MapPin className="mr-1 inline h-3 w-3" />
          {job.origin_address} → {job.destination_address}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Dispatch date *</Label>
            <Input data-testid="assignment-date" type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
          </div>
          <div>
            <Label>Start window</Label>
            <Input data-testid="assignment-start" type="datetime-local" value={startWindow} onChange={(e) => setStartWindow(e.target.value)} />
          </div>
          <div>
            <Label>End window</Label>
            <Input data-testid="assignment-end" type="datetime-local" value={endWindow} onChange={(e) => setEndWindow(e.target.value)} />
          </div>
        </div>

        {/* Primary truck + crew lead */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Primary truck</Label>
            <Select data-testid="assignment-primary-truck" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="">— None —</option>
              {activeTrucks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Crew lead</Label>
            <Select data-testid="assignment-crew-lead" value={crewLeadId} onChange={(e) => setCrewLeadId(e.target.value)}>
              <option value="">— None —</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Route order</Label>
          <Input data-testid="assignment-route-order" type="number" min="0" step="1" value={routeOrder} onChange={(e) => setRouteOrder(e.target.value)} placeholder="0" />
        </div>

        {/* Full crew roster */}
        <div>
          <Label>Crew roster (all members on this job)</Label>
          <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-slate-200 p-2" data-testid="assignment-roster">
            {activeMembers.length === 0 ? (
              <p className="p-2 text-xs text-slate-400">No team members available.</p>
            ) : (
              activeMembers.map((m) => {
                const isLead = m.id === crewLeadId;
                const checked = rosterIds.has(m.id) || isLead;
                return (
                  <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      data-testid={`roster-member-${m.id}`}
                      checked={checked}
                      disabled={isLead}
                      onChange={() => toggleRoster(m.id)}
                    />
                    <span className="flex-1 text-navy">{m.display_name}</span>
                    {isLead && <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-navy">Crew lead</span>}
                  </label>
                );
              })
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">The crew lead is always included in the roster.</p>
        </div>

        {/* Full truck list */}
        <div>
          <Label>Trucks on this job (all)</Label>
          <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-slate-200 p-2" data-testid="assignment-truck-list">
            {activeTrucks.length === 0 ? (
              <p className="p-2 text-xs text-slate-400">No active trucks available.</p>
            ) : (
              activeTrucks.map((t) => {
                const isPrimary = t.id === truckId;
                const checked = truckIds.has(t.id) || isPrimary;
                return (
                  <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      data-testid={`truck-list-${t.id}`}
                      checked={checked}
                      disabled={isPrimary}
                      onChange={() => toggleTruck(t.id)}
                    />
                    <span className="flex-1 text-navy">{t.name}</span>
                    {isPrimary && <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-navy">Primary</span>}
                  </label>
                );
              })
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">The primary truck is always included in the list.</p>
        </div>

        <div>
          <Label>Dispatcher notes</Label>
          <textarea
            data-testid="assignment-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Route notes, gate codes, sequencing…"
          />
        </div>
      </div>
    </Drawer>
  );
}
