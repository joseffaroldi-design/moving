"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Route-level error boundary (Next.js App Router). Renders inside the root
// layout, so brand tokens/Tailwind are available. Never exposes error internals.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-cream px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-card">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-gold-hover">
          Something went wrong
        </p>
        <h1 className="font-serif text-2xl font-bold text-navy">
          We hit an unexpected error
        </h1>
        <p className="mt-2 text-sm text-muted">
          The page couldn&apos;t be displayed. You can retry, or head back to your dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="navy" onClick={() => reset()} data-testid="error-retry">
            Try again
          </Button>
          <Link href="/dashboard" data-testid="error-dashboard-link">
            <Button variant="outline" className="w-full sm:w-auto">Go to dashboard</Button>
          </Link>
          <Link href="/login" data-testid="error-login-link">
            <Button variant="subtle" className="w-full sm:w-auto">Back to login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
