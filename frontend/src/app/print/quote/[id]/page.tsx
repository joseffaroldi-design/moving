import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuoteDocument } from "@/components/print/QuoteDocument";
import { PrintBar } from "@/components/print/PrintBar";
import type { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

// Loads a saved quote + line items via an AUTHENTICATED, RLS-scoped staff read
// (server-side Supabase using the request session cookies). This does NOT use
// the public mvp-dashboard payload. A future secure customer token path (0015)
// will provide customer-facing access without staff privileges.
export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let quote: Quote | undefined;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: q } = await supabase
      .from("quotes")
      .select("*, customers(id, first_name, last_name, email, phone)")
      .eq("id", id)
      .maybeSingle();
    if (q) {
      const { data: items } = await supabase
        .from("quote_line_items")
        .select("*")
        .eq("quote_id", id)
        .order("sort_order", { ascending: true });
      quote = { ...(q as Record<string, unknown>), quote_line_items: items ?? [] } as unknown as Quote;
    }
  } catch {
    quote = undefined;
  }

  return (
    <>
      <PrintBar backHref="/dashboard/quotes" />
      <div className="py-6">
        {quote ? (
          <div className="mx-auto max-w-[8.5in] bg-white shadow-card print:shadow-none">
            <QuoteDocument quote={quote} />
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-8 text-center">
            <p className="font-serif text-lg font-bold text-navy">Quote not available</p>
            <p className="mt-1 text-sm text-muted">
              This quote could not be loaded. It may not exist, or you may need to be signed in as
              staff of the owning company to view it.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
