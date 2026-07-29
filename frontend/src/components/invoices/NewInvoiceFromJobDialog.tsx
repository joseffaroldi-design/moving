"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import {
  fetchCompletedJobsWithoutInvoice,
  generateInvoiceForJob,
  type EligibleJob,
} from "@/lib/invoices";

function jobLabel(j: EligibleJob): string {
  const c = j.customers;
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "";
  return `${j.job_number ?? "Job"}${name ? ` · ${name}` : ""}`;
}

// Lists completed jobs without an invoice and generates a draft for the chosen
// one via the idempotent generate_invoice_for_job RPC.
export function NewInvoiceFromJobDialog({
  open,
  onClose,
  companyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onCreated: (invoiceId: string) => void;
}) {
  const toast = useToast();
  const [jobs, setJobs] = useState<EligibleJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await fetchCompletedJobsWithoutInvoice(companyId));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load eligible jobs.", "error");
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const generate = async (jobId: string) => {
    if (busyId) return;
    setBusyId(jobId);
    try {
      const res = await generateInvoiceForJob(jobId);
      toast(res.created ? "Draft invoice created." : "Invoice already existed — opening it.", "success");
      onCreated(res.invoice_id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not generate the invoice.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/40" onClick={busyId ? undefined : onClose} />
      <div
        data-testid="new-invoice-dialog"
        className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-md border border-slate-200 bg-white p-5 shadow-dropdown"
      >
        <h3 className="font-heading text-base font-semibold text-navy">New invoice from job</h3>
        <p className="mt-1 text-sm text-slate-500">
          Choose a completed job that doesn&apos;t have an invoice yet.
        </p>

        <div className="mt-4 flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading eligible jobs…</p>
          ) : jobs.length === 0 ? (
            <div className="rounded-md bg-slate-50 p-6 text-center">
              <Briefcase className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              <p className="text-sm text-slate-600">No eligible jobs.</p>
              <p className="mt-1 text-xs text-slate-500">
                Only completed jobs without an existing invoice can be invoiced.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j, i) => (
                <li key={j.id}>
                  <button
                    onClick={() => generate(j.id)}
                    disabled={!!busyId}
                    data-testid={`eligible-job-${i}`}
                    className="flex w-full items-center justify-between rounded-md border border-slate-200 p-3 text-left hover:border-gold hover:bg-cream disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy">{jobLabel(j)}</p>
                      <p className="truncate text-xs text-slate-500">{formatDateTime(j.scheduled_start)}</p>
                    </div>
                    <span className="ml-2 shrink-0 text-xs font-semibold text-gold-hover">
                      {busyId === j.id ? "Creating…" : "Create"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={!!busyId}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
