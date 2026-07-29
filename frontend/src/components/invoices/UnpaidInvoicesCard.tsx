"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { fetchUnpaidSummary, type UnpaidSummary } from "@/lib/invoices";

// Dashboard unpaid/overdue summary. Reads the `invoices` table via the
// authenticated, RLS-scoped client (company-scoped). Does NOT touch the
// service-role-only dashboard views.
export function UnpaidInvoicesCard() {
  const { me } = useAuth();
  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const [summary, setSummary] = useState<UnpaidSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchUnpaidSummary(companyId)
      .then((s) => active && setSummary(s))
      .catch(() => active && setSummary(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [companyId]);

  return (
    <Card data-testid="unpaid-invoices-card">
      <CardHeader
        title="Outstanding Invoices"
        action={
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            View invoices <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4">
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : (
          <>
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Outstanding</p>
              <p className="mt-1 font-heading text-xl font-bold text-navy" data-testid="unpaid-outstanding">
                {formatCurrency(summary?.outstanding ?? 0)}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Unpaid</p>
              <p className="mt-1 font-heading text-xl font-bold text-navy" data-testid="unpaid-count">
                {summary?.unpaidCount ?? 0}
              </p>
            </div>
            <div className="p-4">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                {(summary?.overdueCount ?? 0) > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
                Overdue
              </p>
              <p
                className={`mt-1 font-heading text-xl font-bold ${(summary?.overdueCount ?? 0) > 0 ? "text-red-600" : "text-navy"}`}
                data-testid="unpaid-overdue"
              >
                {summary?.overdueCount ?? 0}
                {(summary?.overdueAmount ?? 0) > 0 && (
                  <span className="ml-1 text-xs font-medium text-slate-400">
                    ({formatCurrency(summary?.overdueAmount ?? 0)})
                  </span>
                )}
              </p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
