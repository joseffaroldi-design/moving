"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { ErrorState } from "@/components/ui/error-state";

interface MoveDocument {
  id: string;
  document_key: string;
  title: string;
  version_no: number;
  signature_required: boolean;
  signature_status: string;
  signed_at: string | null;
  finalized_at: string | null;
}

export default function MobileDocumentsPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [items, setItems] = useState<MoveDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    setJobId(id);
    if (!id) { setLoading(false); return; }
    const supabase = getBrowserClient();
    supabase.rpc("crew_list_move_documents", { p_job_id: id }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setItems(((data as { items?: MoveDocument[] } | null)?.items ?? []));
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading documents…</p>;
  if (error) return <ErrorState message={error} />;
  if (!jobId) return <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card"><FileSignature className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-2 text-sm text-slate-500">Open a job first.</p><Link href="/mobile/jobs" className="mt-3 inline-block text-sm font-semibold text-gold-hover">Choose a job</Link></div>;

  return (
    <div>
      <h1 className="font-heading text-xl font-bold text-navy">Required Documents</h1>
      <p className="mt-1 text-sm text-slate-500">Customer signatures use the existing secure customer portal. Crew can verify status here.</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No finalized move documents are attached to this job yet. Completion will remain blocked until required documents are present and signed.</div>
        ) : items.map((d) => {
          const signed = d.signature_status === "signed" || !d.signature_required;
          return <div key={d.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex items-start gap-3"><FileSignature className="mt-0.5 h-5 w-5 text-gold-hover"/><div className="min-w-0 flex-1"><p className="font-semibold text-navy">{d.title}</p><p className="mt-0.5 text-xs text-slate-500">Version {d.version_no} · {d.document_key.replaceAll("_"," ")}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${signed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{signed ? "Signed" : "Signature needed"}</span></div>
          </div>;
        })}
      </div>
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">If a customer still needs to sign, have them use their Southern Magnolia customer portal. Signed originals remain immutable.</div>
      <Link href={`/mobile/jobs/${jobId}`} className="mt-5 block text-center text-sm font-semibold text-gold-hover">Back to job</Link>
    </div>
  );
}
