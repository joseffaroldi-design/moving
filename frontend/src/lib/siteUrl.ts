// Public site URL — configured via NEXT_PUBLIC_SITE_URL (a PUBLIC value, no secret).
// Used for metadataBase, canonical, Open Graph / Twitter URLs and absolute asset URLs.
//
// Set NEXT_PUBLIC_SITE_URL to the public production domain (e.g. https://yourdomain.com).
// A localhost fallback is used ONLY for local/preview development.

const RAW = process.env.NEXT_PUBLIC_SITE_URL;
const DEV_FALLBACK = "http://localhost:3000";

// Strip any trailing slash(es) so we never emit double slashes when composing URLs.
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function resolveSiteUrl(): string {
  if (RAW && RAW.trim()) return normalize(RAW);
  // In production the public URL must be provided. Warn loudly (don't hard-fail the build)
  // and fall back to localhost so the build still completes.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[siteUrl] NEXT_PUBLIC_SITE_URL is not set for the production build. " +
        "Canonical/OG/Twitter URLs will fall back to " +
        DEV_FALLBACK +
        ". Set NEXT_PUBLIC_SITE_URL to your public domain."
    );
  }
  return DEV_FALLBACK;
}

export const SITE_URL = resolveSiteUrl();
