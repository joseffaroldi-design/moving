"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSignature, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { getBrowserClient } from "@/lib/supabase/client";
import {
  MOVE_DOCUMENT_LABELS,
  staffFinalizeMoveDocument,
  staffListMoveDocuments,
  staffVoidUnsignedMoveDocument,
  type MoveDocumentKey,
  type MoveDocumentListItem,
} from "@/lib/moveDocuments";
import { formatDate } from "@/lib/format";

interface JobOption { id: string; job_number: string; scheduled_start: string; }
const KEYS = Object.keys(MOVE_DOCUMENT_LABELS) as MoveDocumentKey[];

export default function DashboardDocumentsPage() {
  const { role } = useAuth();
  const toast = useToast();
  const canManage = role === "owner" || role === "operations_manager";
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobId, setJobId] = useState("");
  const [items, setItems] = useState<MoveDocumentListItem[]>([]);
  const [key, setKey] = useState<MoveDocumentKey>("service_agreement");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [signatureRequired, setSignatureRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    void supabase.from("jobs").select("id,job_number,scheduled_start").order("scheduled_start", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) toast(error.message, "error");
        else setJobs((data ?? []) as JobOption[]);
      });
  }, [toast]);

  useEffect(() => {
    if (!jobId) { setItems([]); return; }
    void staffListMoveDocuments(jobId).then(setItems).catch((e) => toast(e instanceof Error ? e.message : "Could not load documents.", "error"));
  }, [jobId, toast]);

  useEffect(() => {
    if (!title.trim()) setTitle(MOVE_DOCUMENT_LABELS[key]);
  }, [key, title]);

  const latestByKey = useMemo(() => {
    const map = new Map<MoveDocumentKey, MoveDocumentListItem>();
    for (const item of items) if (!map.has(item.document_key)) map.set(item.document_key, item);
    return map;
  }, [items]);

  async function refresh() {
    if (jobId) setItems(await staffListMoveDocuments(jobId));
  }

  async function finalize() {
    if (!jobId || !title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      const prior = latestByKey.get(key);
      await staffFinalizeMoveDocument({
        jobId,
        documentKey: key,
        title: title.trim(),
        contentSnapshot: content,
        signatureRequired,
        supersedesDocumentId: prior?.id ?? null,
      });
      toast("Finalized immutable document version created.", "success");
      setContent("");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not finalize document.", "error");
    } finally { setBusy(false); }
  }

  async function voidUnsigned(id: string) {
    setBusy(true);
    try {
      await staffVoidUnsignedMoveDocument(id);
      toast("Unsigned document version voided.", "success");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not void document.", "error");
    } finally { setBusy(false); }
  }

  return (
    <div data-testid="dashboard-documents">
      <PageHeader
        title="Move Documents"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Move Documents" }]}
        description="Finalize approved customer-facing move paperwork and track signatures."
      />

      {!canManage ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">Only the owner or operations manager can finalize move-document wording. Dispatch can review readiness from the job workflow.</div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-3 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Paste only Southern Magnolia wording that has already been approved for business/regulatory/insurance use. Finalizing creates a hashed, immutable version. Signed versions cannot be edited or voided.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="font-semibold text-navy">Finalize a document version</h2>
              <div>
                <Label htmlFor="job">Job</Label>
                <select id="job" value={jobId} onChange={(e) => setJobId(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="">Select a job</option>
                  {jobs.map((job) => <option key={job.id} value={job.id}>{job.job_number} · {formatDate(job.scheduled_start)}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="document-key">Document type</Label>
                <select id="document-key" value={key} onChange={(e) => { const next=e.target.value as MoveDocumentKey; setKey(next); setTitle(MOVE_DOCUMENT_LABELS[next]); }} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                  {KEYS.map((value) => <option key={value} value={value}>{MOVE_DOCUMENT_LABELS[value]}</option>)}
                </select>
              </div>
              <div><Label htmlFor="title">Title</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div>
                <Label htmlFor="content">Approved exact wording</Label>
                <textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={14} className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-6" placeholder="Paste the exact approved customer-facing wording for this job/version." />
              </div>
              <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={signatureRequired} onChange={(e) => setSignatureRequired(e.target.checked)} /><span>Customer signature required</span></label>
              <Button variant="gold" loading={busy} disabled={!jobId || !title.trim() || !content.trim()} onClick={() => void finalize()}><FileSignature className="h-4 w-4" /> Finalize immutable version</Button>
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="font-semibold text-navy">Job document history</h2>
              {!jobId ? <p className="mt-4 text-sm text-slate-500">Select a job to see its document versions.</p> : items.length === 0 ? <p className="mt-4 text-sm text-slate-500">No move-document versions have been finalized for this job.</p> : (
                <div className="mt-4 space-y-3">
                  {items.map((item) => {
                    const signed = item.signature_status === "signed";
                    return <div key={item.id} className="rounded-md border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-navy">{item.title}</p><p className="mt-1 text-xs text-slate-500">{MOVE_DOCUMENT_LABELS[item.document_key]} · Version {item.version_no}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${signed ? "bg-green-100 text-green-800" : item.lifecycle_status === "voided" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{signed ? "Signed" : item.lifecycle_status === "voided" ? "Voided" : item.signature_required ? "Awaiting signature" : "Finalized"}</span></div>
                      <p className="mt-2 text-xs text-slate-500">Finalized {formatDate(item.finalized_at)}</p>
                      {item.content_sha256 ? <p className="mt-1 break-all text-[10px] text-slate-400">{item.content_sha256}</p> : null}
                      {!signed && item.lifecycle_status === "finalized" ? <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => void voidUnsigned(item.id)}>Void unsigned version</Button> : null}
                    </div>;
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
