"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { crewReportIssue, type CrewIssueCategory } from "@/lib/crew";

const categories: Array<{ value: CrewIssueCategory; label: string }> = [
  { value: "access", label: "Access" },
  { value: "customer_request", label: "Customer Request" },
  { value: "property_condition", label: "Property Condition" },
  { value: "item_condition", label: "Item Condition" },
  { value: "safety", label: "Safety" },
  { value: "schedule", label: "Schedule" },
  { value: "other", label: "Other" },
];

export default function MobileIssuesPage() {
  const toast = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [category, setCategory] = useState<CrewIssueCategory>("other");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdIssueId, setCreatedIssueId] = useState<string | null>(null);

  useEffect(() => setJobId(new URLSearchParams(window.location.search).get("job")), []);

  async function submit() {
    if (!jobId || !note.trim()) return;
    setSubmitting(true);
    try {
      const issue = await crewReportIssue(jobId, category, note);
      setCreatedIssueId(issue.id);
      toast("Issue reported to the office.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to report issue.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!jobId) return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card">
      <AlertTriangle className="mx-auto h-8 w-8 text-slate-400" />
      <h1 className="mt-2 font-heading text-xl font-bold text-navy">Report an Issue</h1>
      <p className="mt-2 text-sm text-slate-500">Open a job first so the issue is attached to the correct move.</p>
      <Link href="/mobile/jobs" className="mt-4 inline-block text-sm font-semibold text-gold-hover">Choose a job</Link>
    </div>
  );

  if (createdIssueId) return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-card">
      <AlertTriangle className="h-7 w-7 text-gold-hover" />
      <h1 className="mt-2 font-heading text-xl font-bold text-navy">Issue Reported</h1>
      <p className="mt-2 text-sm text-slate-600">The office can now see this issue. Add photos if they help document what happened.</p>
      <Link href={`/mobile/photos?job=${jobId}&issue=${createdIssueId}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">
        <Camera className="h-4 w-4" /> Add Issue Photos
      </Link>
      <Link href={`/mobile/jobs/${jobId}`} className="mt-3 block text-center text-sm font-semibold text-gold-hover">Back to job</Link>
    </div>
  );

  return (
    <div>
      <h1 className="font-heading text-xl font-bold text-navy">Report an Issue</h1>
      <p className="mt-1 text-sm text-slate-500">Keep this factual and brief. This is operational documentation, not a claims decision.</p>
      <div className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-card">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as CrewIssueCategory)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy">
          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">What happened?</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={6} placeholder="Describe the issue, location, item, and what the crew did next." className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <Button variant="navy" size="lg" className="mt-4 w-full" disabled={submitting || !note.trim()} onClick={() => void submit()}>
          <AlertTriangle className="h-4 w-4" /> {submitting ? "Reporting…" : "Report Issue"}
        </Button>
      </div>
      <Link href={`/mobile/jobs/${jobId}`} className="mt-5 block text-center text-sm font-semibold text-gold-hover">Back to job</Link>
    </div>
  );
}
