"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { crewPrepareChecklist, crewSetChecklistItem, type CrewChecklistItem } from "@/lib/crew";

export default function MobileChecklistPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");
  const [items, setItems] = useState<CrewChecklistItem[]>([]);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    crewPrepareChecklist(jobId)
      .then(setItems)
      .catch((e) => toast(e instanceof Error ? e.message : "Unable to load checklist.", "error"))
      .finally(() => setLoading(false));
  }, [jobId, toast]);

  async function toggle(item: CrewChecklistItem) {
    if (!jobId || savingId) return;
    setSavingId(item.id);
    try {
      const updated = await crewSetChecklistItem(jobId, item.id, !item.is_completed);
      setItems((current) => current.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to update checklist.", "error");
    } finally {
      setSavingId(null);
    }
  }

  if (!jobId) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card">
        <h1 className="font-heading text-xl font-bold text-navy">Move Checklist</h1>
        <p className="mt-2 text-sm text-slate-500">Open a job first so the checklist is saved to the correct move.</p>
        <Link href="/mobile/jobs" className="mt-4 inline-block text-sm font-semibold text-gold-hover">Choose a job</Link>
      </div>
    );
  }

  const done = items.filter((item) => item.is_completed).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold text-navy">Move Checklist</h1>
        <span className="text-sm font-medium text-slate-500">{done}/{items.length || 8}</span>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-card">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading checklist…</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              data-testid={`checklist-item-${i}`}
              onClick={() => toggle(item)}
              disabled={savingId === item.id}
              className="flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left last:border-0 active:bg-slate-50 disabled:opacity-60"
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", item.is_completed ? "border-accent bg-accent text-white" : "border-slate-300 bg-white")}>
                {item.is_completed && <Check className="h-4 w-4" />}
              </span>
              <span className={cn("text-sm", item.is_completed ? "text-slate-400 line-through" : "text-slate-700")}>
                {item.title}
              </span>
            </button>
          ))
        )}
      </div>

      <Link href={`/mobile/jobs/${jobId}`} className="mt-4 block text-center text-sm font-semibold text-gold-hover">Back to job</Link>
    </div>
  );
}
