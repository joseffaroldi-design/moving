/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: __dirname,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "yrvgovkkukmtdmgejtxc.supabase.co" },
    ],
  },
  poweredByHeader: false,
  async headers() {
    // Baseline hardening. NOTE: a resource-restricting Content-Security-Policy
    // (script-src/connect-src/img-src) is intentionally NOT enforced here yet —
    // it requires per-route nonce work + live testing against Supabase auth,
    // Google-less fonts, and image hosts. Only the non-breaking clickjacking
    // directive (frame-ancestors) is set. Full CSP tracked in RC1_STATIC_AUDIT.md.
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Permissions-Policy", value: "microphone=(), camera=(self), geolocation=(self), browsing-topics=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    const noStore = [
      { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      // Never cache authenticated / PII-bearing app surfaces.
      { source: "/dashboard/:path*", headers: noStore },
      { source: "/portal/:path*", headers: noStore },
      { source: "/mobile/:path*", headers: noStore },
    ];
  },
};

module.exports = nextConfig;
