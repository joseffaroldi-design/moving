"use client";

import { useEffect, useState } from "react";
import {
  MARKETING_COMPANY_ID,
  fetchWebsiteMedia,
  type WebsiteMediaRecord,
  type WebsiteMediaSlot,
} from "@/lib/websiteMedia";

let mediaPromise: Promise<WebsiteMediaRecord[]> | null = null;

function loadMedia() {
  if (!mediaPromise) {
    mediaPromise = fetchWebsiteMedia(MARKETING_COMPANY_ID).catch(() => []);
  }
  return mediaPromise;
}

export function ManagedMarketingImage({
  slot,
  defaultSrc,
  alt,
  className = "",
}: {
  slot: WebsiteMediaSlot;
  defaultSrc: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState(defaultSrc);
  const [resolvedAlt, setResolvedAlt] = useState(alt);

  useEffect(() => {
    let active = true;
    loadMedia().then((rows) => {
      if (!active) return;
      const record = rows.find((row) => row.slot === slot);
      if (record?.public_url) setSrc(record.public_url);
      if (record?.alt_text) setResolvedAlt(record.alt_text);
    });
    return () => {
      active = false;
    };
  }, [slot]);

  return (
    // Dynamic media can be hosted by each tenant's Supabase project, so a fixed Next Image host allowlist would not scale.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={resolvedAlt} className={className} />
  );
}
