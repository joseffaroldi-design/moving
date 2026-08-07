"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { crewClockIn, crewClockOut, crewGetTimeState, type CrewTimeState } from "@/lib/crew";

export default function MobileClockPage() {
  const toast = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<CrewTimeState>({ clocked_in: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setJobId(new URLSearchParams(window.location.search).get("job"));
    crewGetTimeState()
      .then(setState)
      .catch((e) => toast(e instanceof Error ? e.message : "Unable to load time clock.", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  async function clockIn() {
    setSaving(true);
    try {
      const next = await crewClockIn(jobId);
      setState(next);
      toast("Clocked in.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to clock in.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function clockOut() {
    setSaving(true);
    try {
      const next = await crewClockOut();
      setState(next);
      toast("Clocked out.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to clock out.", "error");
    } finally {
      setSaving(false);
    }
  }

  const since = state.clock_in_at ? new Date(state.clock_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div>
      <h1 className="mb-4 font-heading text-xl font-bold text-navy">Time Clock</h1>
      <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state.clocked_in ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Clock className={`h-8 w-8 ${state.clocked_in ? "text-emerald-600" : "text-slate-400"}`} />
        </div>
        <p className="mt-3 font-heading text-lg font-bold text-navy">{loading ? "Loading…" : state.clocked_in ? "On the clock" : "Not clocked in"}</p>
        {since && <p className="text-sm text-slate-500">Since {since}</p>}
        {state.clocked_in && state.job_id && <p className="mt-1 text-xs text-slate-400">Linked to this move</p>}
      </div>
      <div className="mt-4">
        {state.clocked_in ? (
          <Button variant="danger" size="lg" className="w-full py-4 text-base" onClick={clockOut} disabled={loading || saving} data-testid="clock-out-button"><LogOut className="h-5 w-5" /> {saving ? "Clocking out…" : "Clock Out"}</Button>
        ) : (
          <Button variant="navy" size="lg" className="w-full py-4 text-base" onClick={clockIn} disabled={loading || saving} data-testid="clock-in-button"><LogIn className="h-5 w-5" /> {saving ? "Clocking in…" : "Clock In"}</Button>
        )}
      </div>
      {jobId && <Link href={`/mobile/jobs/${jobId}`} className="mt-4 block text-center text-sm font-semibold text-gold-hover">Back to job</Link>}
    </div>
  );
}
