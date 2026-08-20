"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

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
    if (!id) {
      setLoading(false);
      return;
    }

    const supabase = getBrowserClient();
    supabase.rpc("crew_list_move_documents", { p_job_id: id }).then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message);
      else setItems((data as { items?: MoveDocument[] } | null)?.items ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;

  if (!jobId) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card">
        <FileSignature className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-2 text-sm text-slate-500">Open a job first to review its required documents.</p>
        <Link href="/mobile/jobs" className="mt-3 inline-block text-sm font-semibold text-gold-hover">
          Choose a job
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="crew-documents">
      <h1 className="font-heading text-xl font-bold text-navy">Required Documents</h1>
      <p className="mt-1 text-sm text-slate-500">
        Verify customer signature status before completing the move. Customers sign in their secure portal.
      </p>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No finalized move documents are attached to this job yet. Completion remains blocked until the required completion acknowledgment is present and signed.
          </div>
        ) : (
          items.map((document) => {
            const signed = document.signature_status === "signed" || !document.signature_required;
            return (
              <div key={document.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-gold-hover" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy">{document.title}</p>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">
                      Version {document.version_no} · {document.document_key.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      signed
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {signed ? "Signed" : "Signature needed"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Link
        href={`/mobile/jobs/${jobId}`}
        className="mt-5 block text-center text-sm font-semibold text-gold-hover"
      >
        Back to job
      </Link>
    </div>
  );
}
