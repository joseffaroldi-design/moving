"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSignature, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  MOVE_DOCUMENT_LABELS,
  portalGetMoveDocument,
  portalListMoveDocuments,
  portalSignMoveDocument,
  type MoveDocumentDetail,
  type MoveDocumentListItem,
} from "@/lib/moveDocuments";
import { formatDate } from "@/lib/format";

export default function PortalDocuments() {
  const { loading: authLoading, session } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MoveDocumentListItem[]>([]);
  const [detail, setDetail] = useState<MoveDocumentDetail | null>(null);
  const [signerName, setSignerName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await portalListMoveDocuments());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && session) void load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, session, load]);

  async function openDocument(id: string) {
    try {
      setDetail(await portalGetMoveDocument(id));
      setSignerName("");
      setAcknowledged(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open document.", "error");
    }
  }

  async function sign() {
    if (!detail || !acknowledged || !signerName.trim()) return;
    setSigning(true);
    try {
      await portalSignMoveDocument(detail.id, signerName.trim(), `typed-name:${signerName.trim()}`);
      toast("Document signed successfully.", "success");
      setDetail(await portalGetMoveDocument(detail.id));
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not sign document.", "error");
    } finally {
      setSigning(false);
    }
  }

  return (
    <div data-testid="portal-documents">
      <PageHeader
        title="Documents"
        breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Documents" }]}
        description="Review and sign the finalized paperwork for your move."
      />

      {authLoading || loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No documents need your attention"
          description="Finalized move agreements and acknowledgments will appear here when Southern Magnolia makes them available."
          data-testid="portal-documents-empty"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="space-y-3">
            {items.map((item) => {
              const signed = item.signature_status === "signed";
              return (
                <button
                  key={item.id}
                  onClick={() => void openDocument(item.id)}
                  className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card hover:border-gold"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-navy">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {MOVE_DOCUMENT_LABELS[item.document_key]} · Version {item.version_no}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${signed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {signed ? "Signed" : item.signature_required ? "Signature needed" : "Review"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Finalized {formatDate(item.finalized_at)}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-card">
            {!detail ? (
              <div className="py-12 text-center text-sm text-slate-500">Select a document to review its exact finalized content.</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold-hover">{MOVE_DOCUMENT_LABELS[detail.document_key]}</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">{detail.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">Version {detail.version_no} · Finalized {formatDate(detail.finalized_at)}</p>
                </div>

                <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                  {detail.content_snapshot}
                </div>

                <p className="break-all text-[11px] text-slate-400">Document fingerprint: {detail.content_sha256}</p>

                {detail.signature_status === "signed" ? (
                  <div className="flex gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold">Signed by {detail.signer_name}</p>
                      <p className="mt-1">Signed {formatDate(detail.signed_at)}. This signed version is locked and cannot be overwritten.</p>
                    </div>
                  </div>
                ) : detail.signature_required ? (
                  <div className="space-y-4 rounded-md border border-slate-200 p-4">
                    <div>
                      <Label htmlFor="signer-name">Type your full name</Label>
                      <Input id="signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} autoComplete="name" />
                    </div>
                    <label className="flex items-start gap-3 text-sm text-slate-700">
                      <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                      <span>I have reviewed the exact document shown above and intend my typed name to serve as my electronic signature for this version.</span>
                    </label>
                    <Button variant="gold" onClick={() => void sign()} loading={signing} disabled={!acknowledged || !signerName.trim()}>
                      <FileSignature className="h-4 w-4" /> Sign this document
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No signature is required for this document.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
