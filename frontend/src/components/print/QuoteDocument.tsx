import { CrescentMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { formatCurrency, formatDate } from "@/lib/format";
import { quoteCustomer, addr, contactEmail, contactPhone } from "@/lib/entities";
import { quoteStatusLabel } from "@/lib/quotes";
import type { Quote } from "@/lib/types";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}

const MONEY: { key: keyof Quote; label: string }[] = [
  { key: "hourly_rate", label: "Hourly rate" },
  { key: "estimated_hours", label: "Estimated hours" },
  { key: "travel_fee", label: "Travel fee" },
  { key: "packing_fee", label: "Packing fee" },
  { key: "materials_fee", label: "Materials fee" },
  { key: "discount", label: "Discount" },
  { key: "subtotal", label: "Subtotal" },
  { key: "tax", label: "Tax" },
];

export function QuoteDocument({ quote }: { quote: Quote }) {
  const lineItems = ((quote.line_items ?? quote.quote_line_items ?? []) as Record<string, unknown>[]);
  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-[0.6in] text-slate-800">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-gold pb-4">
        <div className="flex items-center gap-3">
          <CrescentMark className="h-14 w-14" />
          <div>
            <div className="font-serif text-2xl font-bold text-navy">{BRAND.name}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-hover">Movers</div>
          </div>
        </div>
        <div className="text-right text-[12px] text-slate-600">
          <div>{BRAND.phone}</div>
          <div>{BRAND.email}</div>
          <div className="mt-1 font-serif italic text-gold-hover">{BRAND.welcome}</div>
        </div>
      </div>

      {/* Title row */}
      <div className="mt-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy">Quote</h1>
          <p className="mt-1 text-sm text-slate-500">#{quote.quote_number || "—"}</p>
        </div>
        <div className="text-right text-[13px]">
          <Line label="Issued" value={formatDate(quote.created_at as string)} />
          <Line label="Expires" value={formatDate((quote.expires_at || quote.expiration_date) as string)} />
          <Line label="Status" value={quoteStatusLabel(quote.status as string)} />
        </div>
      </div>

      {/* Customer + move */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="rounded-md bg-cream-100 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Prepared for</p>
          <p className="font-semibold text-navy">{quoteCustomer(quote)}</p>
          {contactEmail(quote) && <p className="text-[13px] text-slate-600">{contactEmail(quote)}</p>}
          {contactPhone(quote) && <p className="text-[13px] text-slate-600">{contactPhone(quote)}</p>}
        </div>
        <div className="rounded-md bg-cream-100 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Move details</p>
          <Line label="Move date" value={formatDate(quote.move_date as string)} />
          <Line label="Origin" value={addr(quote as Record<string, unknown>, "origin")} />
          <Line label="Destination" value={addr(quote as Record<string, unknown>, "destination")} />
        </div>
      </div>

      {/* Charges */}
      <div className="mt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Itemized charges</p>
        <div className="rounded-md border border-slate-200">
          {MONEY.filter((m) => quote[m.key] !== undefined && quote[m.key] !== null).map((m, i) => (
            <div key={m.key as string} className={`flex justify-between px-3 py-2 text-[13px] ${i > 0 ? "border-t border-slate-100" : ""}`}>
              <span className="text-slate-600">{m.label}</span>
              <span className="font-medium text-navy">
                {m.key === "estimated_hours" ? String(quote[m.key]) : formatCurrency(quote[m.key] as number)}
              </span>
            </div>
          ))}
          {lineItems.map((li, i) => {
            const qty = li.quantity as number | undefined;
            const unit = li.unit_price as number | undefined;
            return (
              <div key={`li-${i}`} className="flex justify-between border-t border-slate-100 px-3 py-2 text-[13px]">
                <span className="text-slate-600">
                  {String(li.description ?? li.name ?? "Item")}
                  {qty !== undefined && unit !== undefined && (
                    <span className="ml-1 text-[11px] text-slate-400">
                      ({qty} × {formatCurrency(unit)})
                    </span>
                  )}
                </span>
                <span className="font-medium text-navy">
                  {formatCurrency((li.amount ?? li.total ?? li.price) as number)}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between border-t-2 border-navy bg-navy px-3 py-2.5 text-sm font-bold text-white">
            <span>Total</span>
            <span>{formatCurrency(quote.total ?? quote.subtotal)}</span>
          </div>
          {(quote.deposit_amount as number) ? (
            <div className="flex justify-between px-3 py-2 text-[12px] text-slate-600">
              <span>Deposit due{quote.deposit_percent ? ` (${quote.deposit_percent}%)` : ""}</span>
              <span className="font-medium text-navy">{formatCurrency(quote.deposit_amount as number)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Notes / terms */}
      {(quote.customer_notes as string) && (
        <div className="mt-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Notes</p>
          <p className="text-[13px] text-slate-600">{String(quote.customer_notes)}</p>
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
        <p>A deposit is required to reserve your move date. This quote is valid until the expiration date shown.</p>
        <p className="mt-1">{BRAND.name} · {BRAND.phone} · {BRAND.email}</p>
      </div>
    </div>
  );
}
