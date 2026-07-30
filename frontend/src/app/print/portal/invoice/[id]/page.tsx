"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PrintBar } from "@/components/print/PrintBar";
import { PortalInvoicePrint } from "@/components/portal/PortalPrintDocuments";
import { useAuth } from "@/components/auth/AuthProvider";
import { portalGetInvoice, safeErrorMessage, type PortalInvoiceDetail } from "@/lib/portal";

export default function PortalInvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { loading: authLoading, session, user } = useAuth();
  const [invoice, setInvoice] = useState<PortalInvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setError("Please sign in to view this invoice.");
      setLoading(false);
      return;
    }
    if (!id) return;
    (async () => {
      try {
        setInvoice(await portalGetInvoice(id));
      } catch (e) {
        setError(safeErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, session, id]);

  return (
    <>
      <PrintBar backHref="/portal/payments" />
      <div className="py-6">
        {loading ? (
          <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading invoice…
          </div>
        ) : invoice ? (
          <div className="mx-auto max-w-[8.5in] bg-white shadow-card print:shadow-none">
            <PortalInvoicePrint invoice={invoice} customerEmail={user?.email} />
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-8 text-center">
            <p className="font-serif text-lg font-bold text-navy">Invoice not available</p>
            <p className="mt-1 text-sm text-slate-500">{error ?? "This invoice could not be loaded."}</p>
          </div>
        )}
      </div>
    </>
  );
}
