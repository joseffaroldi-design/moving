import { CrescentMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { quoteStatusLabel, invoiceStatusLabel } from "@/lib/portal";
import type { PortalInvoiceDetail, PortalQuoteDetail } from "@/lib/portal";

// Branded, customer-safe printable documents. These render ONLY the fields the
// portal RPCs (0026) return — no staff/internal columns. "Download" is the
// browser's Print → Save as PDF (via PrintBar).

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="flex items-start justify-between border-b-2 border-gold pb-4">
      <div className="flex items-center gap-3">
        <CrescentMark className="h-14 w-14" />
        <div>
          <div className="font-serif text-2xl font-bold text-navy">{BRAND.name}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-hover">
            Movers
          </div>
        </div>
      </div>
      <div className="text-right text-[12px] text-slate-600">
        <div>{BRAND.phone}</div>
        <div>{BRAND.email}</div>
        <div className="mt-1 font-serif italic text-gold-hover">{BRAND.welcome}</div>
      </div>
    </div>
  );
}

const QUOTE_MONEY: { key: keyof PortalQuoteDetail; label: string; money?: boolean }[] = [
  { key: "hourly_rate", label: "Hourly rate", money: true },
  { key: "estimated_hours", label: "Estimated hours" },
  { key: "travel_fee", label: "Travel fee", money: true },
  { key: "packing_fee", label: "Packing fee", money: true },
  { key: "materials_fee", label: "Materials fee", money: true },
  { key: "discount", label: "Discount", money: true },
  { key: "subtotal", label: "Subtotal", money: true },
  { key: "tax", label: "Tax", money: true },
];

export function PortalQuotePrint({ quote }: { quote: PortalQuoteDetail }) {
  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-[0.6in] text-slate-800">
      <BrandHeader />

      <div className="mt-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy">Quote</h1>
          <p className="mt-1 text-sm text-slate-500">#{quote.quote_number || "—"}</p>
        </div>
        <div className="text-right text-[13px]">
          <Line label="Issued" value={formatDate(quote.created_at)} />
          <Line label="Expires" value={formatDate(quote.expires_at)} />
          <Line label="Status" value={quoteStatusLabel(quote.status)} />
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">
          Itemized charges
        </p>
        <div className="rounded-md border border-slate-200">
          {QUOTE_MONEY.filter((m) => quote[m.key] !== null && quote[m.key] !== undefined).map(
            (m, i) => (
              <div
                key={m.key as string}
                className={`flex justify-between px-3 py-2 text-[13px] ${
                  i > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <span className="text-slate-600">{m.label}</span>
                <span className="font-medium text-navy">
                  {m.money
                    ? formatCurrency(quote[m.key] as number)
                    : String(quote[m.key])}
                </span>
              </div>
            )
          )}
          {quote.line_items.map((li, i) => (
            <div
              key={`li-${i}`}
              className="flex justify-between border-t border-slate-100 px-3 py-2 text-[13px]"
            >
              <span className="text-slate-600">
                {li.description}
                <span className="ml-1 text-[11px] text-slate-400">
                  ({li.quantity} × {formatCurrency(li.unit_price)})
                </span>
              </span>
              <span className="font-medium text-navy">{formatCurrency(li.total)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t-2 border-navy bg-navy px-3 py-2.5 text-sm font-bold text-white">
            <span>Total</span>
            <span>{formatCurrency(quote.total ?? quote.subtotal)}</span>
          </div>
          {quote.deposit_amount ? (
            <div className="flex justify-between px-3 py-2 text-[12px] text-slate-600">
              <span>
                Deposit due{quote.deposit_percent ? ` (${quote.deposit_percent}%)` : ""}
              </span>
              <span className="font-medium text-navy">
                {formatCurrency(quote.deposit_amount)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
        <p>
          A deposit is required to reserve your move date. This quote is valid until the
          expiration date shown.
        </p>
        <p className="mt-1">
          {BRAND.name} · {BRAND.phone} · {BRAND.email}
        </p>
      </div>
    </div>
  );
}

export function PortalInvoicePrint({
  invoice,
  customerEmail,
}: {
  invoice: PortalInvoiceDetail;
  customerEmail?: string | null;
}) {
  const balance = Number(invoice.balance) || 0;
  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-[0.6in] text-slate-800">
      <BrandHeader />

      <div className="mt-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy">Invoice</h1>
          <p className="mt-1 text-sm text-slate-500">#{invoice.invoice_number || "—"}</p>
        </div>
        <div className="text-right text-[13px]">
          <Line label="Issued" value={formatDate(invoice.sent_at)} />
          <Line label="Due" value={formatDate(invoice.due_date)} />
          <Line label="Status" value={invoiceStatusLabel(invoice.status)} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="rounded-md bg-cream-100 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">
            Bill to
          </p>
          <p className="font-semibold text-navy">Your account</p>
          {customerEmail ? (
            <p className="text-[13px] text-slate-600">{customerEmail}</p>
          ) : null}
        </div>
        <div className="rounded-md bg-cream-100 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">
            Amount due
          </p>
          <p className="font-serif text-2xl font-bold text-navy">{formatCurrency(balance)}</p>
          <p className="text-[12px] text-slate-500">
            of {formatCurrency(invoice.total)} total
          </p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">
          Line items
        </p>
        <div className="rounded-md border border-slate-200">
          {invoice.line_items.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-slate-500">No line items.</div>
          ) : (
            invoice.line_items.map((li, i) => (
              <div
                key={i}
                className={`flex justify-between px-3 py-2 text-[13px] ${
                  i > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <span className="text-slate-600">
                  {li.description}
                  <span className="ml-1 text-[11px] text-slate-400">
                    ({li.quantity} × {formatCurrency(li.unit_price)})
                  </span>
                </span>
                <span className="font-medium text-navy">{formatCurrency(li.total)}</span>
              </div>
            ))
          )}
          <div className="flex justify-between border-t border-slate-100 px-3 py-2 text-[13px]">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium text-navy">{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 px-3 py-2 text-[13px]">
            <span className="text-slate-600">Tax ({invoice.tax_rate ?? 0}%)</span>
            <span className="font-medium text-navy">{formatCurrency(invoice.tax)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-navy bg-navy px-3 py-2.5 text-sm font-bold text-white">
            <span>Total</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
          {Number(invoice.amount_paid) > 0 && (
            <div className="flex justify-between px-3 py-2 text-[13px]">
              <span className="text-slate-600">Amount paid</span>
              <span className="font-medium text-emerald-700">
                − {formatCurrency(invoice.amount_paid)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 px-3 py-2 text-[13px] font-semibold">
            <span className="text-slate-700">Balance due</span>
            <span className={balance > 0 ? "text-red-600" : "text-emerald-700"}>
              {formatCurrency(balance)}
            </span>
          </div>
        </div>
      </div>

      {invoice.payments.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">
            Payments received
          </p>
          <div className="rounded-md border border-slate-200">
            {invoice.payments.map((p, i) => (
              <div
                key={i}
                className={`flex justify-between px-3 py-2 text-[13px] ${
                  i > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <span className="text-slate-600">
                  {formatDateTime(p.paid_at)} · {titleCase(p.method)}
                </span>
                <span className="font-medium text-navy">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
        <p>
          Thank you for choosing {BRAND.name}. To arrange payment, please contact us at{" "}
          {BRAND.phone}.
        </p>
        <p className="mt-1">
          {BRAND.name} · {BRAND.phone} · {BRAND.email}
        </p>
      </div>
    </div>
  );
}
