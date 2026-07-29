import { CrescentMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/invoices";

type AnyObj = Record<string, unknown>;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}

function customerName(c: AnyObj | undefined): string {
  if (!c) return "Customer";
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return n || (c.email as string) || "Customer";
}

// Branded, printable invoice. "Download" is the browser's Print → Save as PDF
// (via PrintBar). Renders server-fetched, RLS-scoped invoice data.
export function InvoiceDocument({
  invoice,
  lineItems,
  payments,
}: {
  invoice: AnyObj;
  lineItems: AnyObj[];
  payments: AnyObj[];
}) {
  const customer = (invoice.customers as AnyObj) ?? undefined;
  const job = (invoice.jobs as AnyObj) ?? undefined;
  const balance = Number(invoice.balance) || 0;

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
          <h1 className="font-serif text-3xl font-bold text-navy">Invoice</h1>
          <p className="mt-1 text-sm text-slate-500">#{(invoice.invoice_number as string) || "—"}</p>
        </div>
        <div className="text-right text-[13px]">
          <Line label="Issued" value={formatDate(invoice.sent_at as string)} />
          <Line label="Due" value={formatDate(invoice.due_date as string)} />
          <Line label="Status" value={invoiceStatusLabel(invoice.status as string)} />
          {job?.job_number ? <Line label="Job" value={String(job.job_number)} /> : null}
        </div>
      </div>

      {/* Bill to */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="rounded-md bg-cream-100 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Bill to</p>
          <p className="font-semibold text-navy">{customerName(customer)}</p>
          {customer?.email ? <p className="text-[13px] text-slate-600">{String(customer.email)}</p> : null}
          {customer?.phone ? <p className="text-[13px] text-slate-600">{String(customer.phone)}</p> : null}
        </div>
        <div className="rounded-md bg-cream-100 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Amount due</p>
          <p className="font-serif text-2xl font-bold text-navy">{formatCurrency(balance)}</p>
          <p className="text-[12px] text-slate-500">of {formatCurrency(invoice.total as number)} total</p>
        </div>
      </div>

      {/* Line items */}
      <div className="mt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Line items</p>
        <div className="rounded-md border border-slate-200">
          {lineItems.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-slate-500">No line items.</div>
          ) : (
            lineItems.map((li, i) => (
              <div key={i} className={`flex justify-between px-3 py-2 text-[13px] ${i > 0 ? "border-t border-slate-100" : ""}`}>
                <span className="text-slate-600">
                  {String(li.description ?? "Item")}
                  <span className="ml-1 text-[11px] text-slate-400">
                    ({String(li.quantity ?? 1)} × {formatCurrency(li.unit_price as number)})
                  </span>
                </span>
                <span className="font-medium text-navy">{formatCurrency(li.total as number)}</span>
              </div>
            ))
          )}
          <div className="flex justify-between border-t border-slate-100 px-3 py-2 text-[13px]">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium text-navy">{formatCurrency(invoice.subtotal as number)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 px-3 py-2 text-[13px]">
            <span className="text-slate-600">Tax ({String(invoice.tax_rate ?? 0)}%)</span>
            <span className="font-medium text-navy">{formatCurrency(invoice.tax as number)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-navy bg-navy px-3 py-2.5 text-sm font-bold text-white">
            <span>Total</span>
            <span>{formatCurrency(invoice.total as number)}</span>
          </div>
          {Number(invoice.amount_paid) > 0 && (
            <div className="flex justify-between px-3 py-2 text-[13px]">
              <span className="text-slate-600">Amount paid</span>
              <span className="font-medium text-emerald-700">− {formatCurrency(invoice.amount_paid as number)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 px-3 py-2 text-[13px] font-semibold">
            <span className="text-slate-700">Balance due</span>
            <span className={balance > 0 ? "text-red-600" : "text-emerald-700"}>{formatCurrency(balance)}</span>
          </div>
        </div>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Payments received</p>
          <div className="rounded-md border border-slate-200">
            {payments.map((p, i) => (
              <div key={i} className={`flex justify-between px-3 py-2 text-[13px] ${i > 0 ? "border-t border-slate-100" : ""}`}>
                <span className="text-slate-600">
                  {formatDateTime(p.paid_at as string)} · {titleCase(p.method as string)}
                  {p.note ? ` · ${String(p.note)}` : ""}
                </span>
                <span className="font-medium text-navy">{formatCurrency(p.amount as number)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {invoice.notes ? (
        <div className="mt-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Notes</p>
          <p className="text-[13px] text-slate-600">{String(invoice.notes)}</p>
        </div>
      ) : null}

      <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
        <p>Thank you for choosing {BRAND.name}. Please remit the balance due by the date shown above.</p>
        <p className="mt-1">{BRAND.name} · {BRAND.phone} · {BRAND.email}</p>
      </div>
    </div>
  );
}
