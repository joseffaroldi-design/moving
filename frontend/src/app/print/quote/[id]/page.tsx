import { getDashboard } from "@/lib/api";
import { QuoteDocument } from "@/components/print/QuoteDocument";
import { PrintBar } from "@/components/print/PrintBar";
import type { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let quote: Quote | undefined;
  try {
    const data = await getDashboard();
    quote = data.recentQuotes.find((q) => String(q.id) === id);
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
            <p className="font-serif text-lg font-bold text-navy">Quote not found</p>
            <p className="mt-1 text-sm text-muted">This quote may require an authenticated session to load.</p>
          </div>
        )}
      </div>
    </>
  );
}
