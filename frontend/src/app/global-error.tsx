"use client";

// Root error boundary. Replaces the root layout when a top-level error occurs,
// so it must render its own <html>/<body> and cannot rely on Tailwind/global
// CSS being present — brand colors are inlined. Never exposes error internals.
const NAVY = "#0E2A4A";
const GOLD = "#C89A3D";
const CREAM = "#F7F0DF";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: CREAM,
            fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "440px",
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "40px",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(14,42,74,0.08)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Something went wrong
            </p>
            <h1 style={{ margin: "8px 0 0", fontSize: "24px", fontWeight: 700, color: NAVY }}>
              We hit an unexpected error
            </h1>
            <p style={{ margin: "12px 0 0", fontSize: "14px", color: "#64748b" }}>
              The application couldn&apos;t load this page. Please retry or return to the login screen.
            </p>
            <div style={{ marginTop: "24px", display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => reset()}
                style={{
                  backgroundColor: NAVY,
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <a
                href="/login"
                style={{
                  backgroundColor: "transparent",
                  color: NAVY,
                  border: `1px solid ${NAVY}`,
                  borderRadius: "8px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Back to login
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
