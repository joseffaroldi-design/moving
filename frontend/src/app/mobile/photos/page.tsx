"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { crewListJobPhotos, crewUploadJobPhoto, type CrewJobPhoto, type CrewPhotoCategory } from "@/lib/crew";

const categoryLabels: Record<CrewPhotoCategory, string> = {
  existing_condition: "Existing Condition",
  special_item: "Special Item",
  loading: "Loading",
  issue: "Issue",
  completion: "Completion",
  other: "Other",
};

export default function MobilePhotosPage() {
  const toast = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [issueId, setIssueId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<CrewJobPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<CrewPhotoCategory>("existing_condition");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJobId(params.get("job"));
    const issue = params.get("issue");
    setIssueId(issue);
    if (issue) setStage("issue");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !jobId) return;
    setLoading(true);
    crewListJobPhotos(jobId)
      .then(setPhotos)
      .catch((e) => toast(e instanceof Error ? e.message : "Unable to load photos.", "error"))
      .finally(() => setLoading(false));
  }, [ready, jobId, toast]);

  async function refresh() {
    if (!jobId) return;
    setPhotos(await crewListJobPhotos(jobId));
  }

  async function onFile(file?: File) {
    if (!jobId || !file) return;
    setUploading(true);
    try {
      await crewUploadJobPhoto(jobId, file, { caption, photoStage: stage, operationalIssueId: issueId });
      setCaption("");
      toast(issueId ? "Issue photo uploaded." : "Photo uploaded.", "success");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to upload photo.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!ready) return <p className="text-sm text-slate-500">Loading photos…</p>;

  if (!jobId) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card">
        <Camera className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="mt-2 font-heading text-xl font-bold text-navy">Job Photos</h1>
        <p className="mt-2 text-sm text-slate-500">Open a job first so every photo is attached to the correct move.</p>
        <Link href="/mobile/jobs" className="mt-4 inline-block text-sm font-semibold text-gold-hover">Choose a job</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 font-heading text-xl font-bold text-navy">{issueId ? "Issue Photos" : "Job Photos"}</h1>
      {issueId && <p className="mb-4 text-sm text-slate-500">Photos uploaded here are linked to the issue you just reported.</p>}
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Photo category</label>
        <select value={stage} onChange={(e) => setStage(e.target.value as CrewPhotoCategory)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy" disabled={Boolean(issueId)}>
          {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Caption (optional)</label>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} placeholder="Front doorway before move" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="navy" size="lg" className="mt-4 w-full py-4 text-base" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="upload-photo-button">
          <Upload className="h-5 w-5" /> {uploading ? "Uploading…" : "Take or Upload Photo"}
        </Button>
        <p className="mt-2 text-center text-xs text-slate-400">Private job storage · images up to 15 MB</p>
      </div>
      <div className="mt-5">
        {loading ? <p className="text-sm text-slate-500">Loading photos…</p> : photos.length === 0 ? (
          <EmptyState icon={Camera} title="No photos yet" description="Capture move documentation using the approved photo categories." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-card">
                {photo.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.signed_url} alt={photo.caption || "Job photo"} className="aspect-square w-full object-cover" />
                ) : <div className="flex aspect-square items-center justify-center bg-slate-100"><Camera className="h-7 w-7 text-slate-400" /></div>}
                <div className="p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-hover">{categoryLabels[(photo.photo_stage as CrewPhotoCategory) || "other"] ?? photo.photo_stage ?? "Photo"}</p>
                  {photo.caption && <p className="mt-0.5 text-xs text-slate-700">{photo.caption}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Link href={`/mobile/jobs/${jobId}`} className="mt-5 block text-center text-sm font-semibold text-gold-hover">Back to job</Link>
    </div>
  );
}
