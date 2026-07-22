"use client";

import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

export function PrintBar({ backHref }: { backHref?: string }) {
  return (
    <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      {backHref ? (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:text-gold-hover">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      ) : <span />}
      <button
        onClick={() => window.print()}
        data-testid="print-download-button"
        className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
      >
        <Printer className="h-4 w-4" /> Print / Download PDF
      </button>
    </div>
  );
}
