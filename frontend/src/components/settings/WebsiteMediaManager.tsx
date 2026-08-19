"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, RefreshCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  WEBSITE_MEDIA_SLOTS,
  fetchWebsiteMedia,
  restoreWebsiteMediaDefault,
  uploadWebsiteMedia,
  type WebsiteMediaRecord,
  type WebsiteMediaSlot,
} from "@/lib/websiteMedia";

export function WebsiteMediaManager({ companyId }: { companyId: string | null }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<WebsiteMediaRecord[]>([]);
  const [busySlot, setBusySlot] = useState<WebsiteMediaSlot | null>(null);
  const [altText, setAltText] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchWebsiteMedia(companyId)
      .then((rows) => {
        if (!active) return;
        setRecords(rows);
        setAltText(Object.fromEntries(rows.map((row) => [row.slot, row.alt_text ?? ""])));
      })
      .catch((e) => active && toast(e instanceof Error ? e.message : "Could not load website images.", "error"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [companyId, toast]);

  const bySlot = useMemo(() => new Map(records.map((record) => [record.slot, record])), [records]);

  async function onPick(slot: WebsiteMediaSlot, file?: File) {
    if (!companyId || !file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("Images must be 8 MB or smaller.", "error");
      return;
    }
    setBusySlot(slot);
    try {
      const saved = await uploadWebsiteMedia(companyId, slot, file, altText[slot] ?? "");
      setRecords((rows) => [...rows.filter((row) => row.slot !== slot), saved]);
      toast("Website image updated.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not upload image.", "error");
    } finally {
      setBusySlot(null);
      if (fileRefs.current[slot]) fileRefs.current[slot]!.value = "";
    }
  }

  async function onRestore(slot: WebsiteMediaSlot) {
    if (!companyId) return;
    setBusySlot(slot);
    try {
      await restoreWebsiteMediaDefault(companyId, slot);
      setRecords((rows) => rows.filter((row) => row.slot !== slot));
      setAltText((current) => ({ ...current, [slot]: "" }));
      toast("Default image restored.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not restore default image.", "error");
    } finally {
      setBusySlot(null);
    }
  }

  if (!companyId) {
    return <p className="text-sm text-muted">A company is required before website images can be managed.</p>;
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading website images…</p>;
  }

  return (
    <div>
      <div className="mb-5 flex items-start gap-3 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Replace the approved public website images without editing code. Uploaded images are company-scoped, and Restore default returns that slot to the built-in Southern Magnolia artwork.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {WEBSITE_MEDIA_SLOTS.map((item) => {
          const record = bySlot.get(item.slot);
          const preview = record?.public_url || item.defaultUrl;
          const busy = busySlot === item.slot;
          return (
            <div key={item.slot} className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                {/* Public URLs can come from the tenant's Supabase project, so avoid a fixed Next image host allowlist. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={record?.alt_text || item.label} className="h-full w-full object-cover" />
                <span className="absolute left-3 top-3 rounded-full bg-navy/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cream">
                  {record ? "Custom" : "Default"}
                </span>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-navy">{item.label}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                </div>
                <div>
                  <Label htmlFor={`alt-${item.slot}`}>Image description</Label>
                  <Input
                    id={`alt-${item.slot}`}
                    value={altText[item.slot] ?? record?.alt_text ?? ""}
                    onChange={(e) => setAltText((current) => ({ ...current, [item.slot]: e.target.value }))}
                    placeholder="Describe the image for accessibility"
                  />
                </div>
                <input
                  ref={(node) => {
                    fileRefs.current[item.slot] = node;
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => void onPick(item.slot, e.target.files?.[0])}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="gold"
                    loading={busy}
                    disabled={busySlot !== null && !busy}
                    onClick={() => fileRefs.current[item.slot]?.click()}
                  >
                    <Upload className="h-4 w-4" /> {record ? "Replace" : "Upload"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!record || busySlot !== null}
                    onClick={() => void onRestore(item.slot)}
                  >
                    <RefreshCcw className="h-4 w-4" /> Restore default
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
