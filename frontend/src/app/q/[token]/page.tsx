"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  getQuoteByApprovalToken,
  respondToQuoteApproval,
  quoteStatusLabel,
  type PublicQuote,
} from "@/lib/quotes";

export default function QuoteApprovalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);

  useEffect(() => {
    if (!token) return;
    getQuoteByApprovalToken(token)
      .then(setQuote)
      .catch((e) => setError(e instanceof Error ? e.message : "This quote link is unavailable."))
      .finally(() => setLoading(false));
  }, [token]);

  async function respond(d: "accept" | "decline") {
    setBusy(d);
    try {
      const res = await respondToQuoteApproval(token, d);
      setDecision(res.status as "accepted" | "rejected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record your response.");
    } finally {
      setBusy(null);
    }
  }

  const customerName = quote
    ? [quote.customer?.first_name, quote.customer?.last_name].filter(Boolean).join(" ")
    : "";

  return (
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <Logo variant="dark" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-12 text-center shadow-card">
            <Loader2 className="h-6 w-6 animate-spin text-gold-hover" />
            <p className="text-sm text-muted">Loading your quote…</p>
          </div>
        ) : error ? (
          <div
            data-testid="approval-error"
            className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-white p-12 text-center shadow-card"
          >
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <p className="font-serif text-xl font-bold text-navy">Quote unavailable</p>
            <p className="max-w-sm text-sm text-muted">{error}</p>
            <p className="mt-2 text-xs text-muted">
              Questions? Call us at{" "}
              <a href={BRAND.phoneHref} className="font-semibold text-gold-hover">
                {BRAND.phone}
              </a>
              .
            </p>
          </div>
        ) : decision ? (
          <div
            data-testid="approval-result"
            className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-12 text-center shadow-card"
          >
            {decision === "accepted" ? (
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            ) : (
              <XCircle className="h-10 w-10 text-slate-400" />
            )}
            <p className="font-serif text-2xl font-bold text-navy">
              {decision === "accepted" ? "Quote Approved" : "Quote Declined"}
            </p>
            <p className="max-w-sm text-sm text-muted">
              {decision === "accepted"
                ? `Thank you, ${customerName || "there"}! We've received your approval and our team will be in touch to confirm the details.`
                : "Thanks for letting us know. If anything changes, just reach out and we'll be happy to help."}
            </p>
            <p className="mt-2 text-xs text-muted">
              {BRAND.name} · {BRAND.phone}
            </p>
          </div>
        ) : quote ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card" data-testid="approval-quote">
            <div className="border-b border-slate-100 bg-navy px-6 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                Moving Estimate
              </p>
              <div className="mt-1 flex items-end justify-between">
                <h1 className="font-serif text-2xl font-bold">{quote.quote_number}</h1>
                <span className="text-sm text-slate-300">
                  {quoteStatusLabel(quote.status)}
                </span>
              </div>
              {customerName && (
                <p className="mt-1 text-sm text-slate-300">Prepared for {customerName}</p>
              )}
            </div>

            <div className="px-6 py-5">
              <div className="rounded-md border border-slate-200">
                {(quote.hourly_rate || quote.estimated_hours) && (
                  <Row
                    label={`Labor${quote.hourly_rate ? ` (${formatCurrency(quote.hourly_rate)}/hr × ${quote.estimated_hours ?? 0} hrs)` : ""}`}
                    value={formatCurrency((quote.hourly_rate ?? 0) * (quote.estimated_hours ?? 0))}
                  />
                )}
                {quote.line_items.map((li, i) => (
                  <Row
                    key={i}
                    label={`${li.description}  (${li.quantity} × ${formatCurrency(li.unit_price)})`}
                    value={formatCurrency(li.total)}
                  />
                ))}
                {!!quote.travel_fee && <Row label="Travel fee" value={formatCurrency(quote.travel_fee)} />}
                {!!quote.packing_fee && <Row label="Packing fee" value={formatCurrency(quote.packing_fee)} />}
                {!!quote.materials_fee && <Row label="Materials fee" value={formatCurrency(quote.materials_fee)} />}
                <Row label="Subtotal" value={formatCurrency(quote.subtotal)} strong />
                {!!quote.discount && <Row label="Discount" value={`− ${formatCurrency(quote.discount)}`} />}
                {!!quote.tax && <Row label={`Tax${quote.tax_rate ? ` (${quote.tax_rate}%)` : ""}`} value={formatCurrency(quote.tax)} />}
                <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
                  <span className="font-semibold">Total</span>
                  <span className="font-serif text-xl font-bold" data-testid="approval-total">
                    {formatCurrency(quote.total)}
                  </span>
                </div>
                {!!quote.deposit_amount && (
                  <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
                    <span>Deposit due ({quote.deposit_percent ?? 0}%)</span>
                    <span className="font-medium text-navy">{formatCurrency(quote.deposit_amount)}</span>
                  </div>
                )}
              </div>

              {quote.expires_at && (
                <p className="mt-3 text-center text-xs text-muted">
                  This estimate is valid until {formatDate(quote.expires_at)}.
                </p>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="gold"
                  size="lg"
                  className="flex-1"
                  loading={busy === "accept"}
                  disabled={busy !== null}
                  onClick={() => respond("accept")}
                  data-testid="approve-quote"
                >
                  <CheckCircle2 className="h-5 w-5" /> Approve Quote
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  loading={busy === "decline"}
                  disabled={busy !== null}
                  onClick={() => respond("decline")}
                  data-testid="decline-quote"
                >
                  <XCircle className="h-5 w-5" /> Decline
                </Button>
              </div>

              <p className="mt-4 text-center text-xs text-muted">
                {BRAND.name} · {BRAND.phone} · {BRAND.email}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 border-b border-slate-100 px-4 py-2.5 text-sm last:border-b-0 ${
        strong ? "font-semibold text-navy" : "text-slate-600"
      }`}
    >
      <span>{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}
