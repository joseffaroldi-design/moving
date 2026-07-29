import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InvoiceDocument } from "@/components/print/InvoiceDocument";
import { PrintBar } from "@/components/print/PrintBar";

export const dynamic = "force-dynamic";

// Loads a saved invoice + line items + payments via an AUTHENTICATED,
// RLS-scoped staff read (server-side Supabase using the request session
// cookies). Company scoping is enforced by RLS — no service-role client.
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let invoice: Record<string, unknown> | undefined;
  let lineItems: Record<string, unknown>[] = [];
  let payments: Record<string, unknown>[] = [];

  try {
    const supabase = await createSupabaseServerClient();
    const { data: inv } = await supabase
      .from("invoices")
      .select("*, customers(id, first_name, last_name, email, phone), jobs(id, job_number)")
      .eq("id", id)
      .maybeSingle();
    if (inv) {
      invoice = inv as Record<string, unknown>;
      const [{ data: items }, { data: pays }] = await Promise.all([
        supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("sort_order", { ascending: true }),
        supabase.from("invoice_payments").select("*").eq("invoice_id", id).order("paid_at", { ascending: false }),
      ]);
      lineItems = (items ?? []) as Record<string, unknown>[];
      payments = (pays ?? []) as Record<string, unknown>[];
    }
  } catch {
    invoice = undefined;
  }

  return (
    <>
      <PrintBar backHref={invoice ? `/dashboard/invoices/${id}` : "/dashboard/invoices"} />
      <div className="py-6">
        {invoice ? (
          <div className="mx-auto max-w-[8.5in] bg-white shadow-card print:shadow-none">
            <InvoiceDocument invoice={invoice} lineItems={lineItems} payments={payments} />
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-8 text-center">
            <p className="font-serif text-lg font-bold text-navy">Invoice not available</p>
            <p className="mt-1 text-sm text-muted">
              This invoice could not be loaded. It may not exist, or you may need to be signed in as
              staff of the owning company to view it.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
