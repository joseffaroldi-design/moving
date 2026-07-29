"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import {
  updateDraftInvoiceWithItems,
  computeInvoiceTotalsPreview,
  type InvoiceRecord,
  type InvoiceLineItem,
} from "@/lib/invoices";

interface EditableItem {
  description: string;
  quantity: string;
  unit_price: string;
}

function toEditable(items: InvoiceLineItem[]): EditableItem[] {
  if (items.length === 0) return [{ description: "", quantity: "1", unit_price: "0" }];
  return items.map((li) => ({
    description: li.description ?? "",
    quantity: String(li.quantity ?? 1),
    unit_price: String(li.unit_price ?? 0),
  }));
}

export function InvoiceEditorDrawer({
  open,
  onClose,
  invoice,
  lineItems,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  invoice: InvoiceRecord;
  lineItems: InvoiceLineItem[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<EditableItem[]>(toEditable(lineItems));
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 0));
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [dueDate, setDueDate] = useState(invoice.due_date ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setItems(toEditable(lineItems));
      setTaxRate(String(invoice.tax_rate ?? 0));
      setNotes(invoice.notes ?? "");
      setDueDate(invoice.due_date ?? "");
    }
  }, [open, invoice, lineItems]);

  const numeric = useMemo(
    () =>
      items.map((it) => ({
        quantity: parseFloat(it.quantity) || 0,
        unit_price: parseFloat(it.unit_price) || 0,
      })),
    [items]
  );

  const preview = useMemo(
    () => computeInvoiceTotalsPreview(numeric, parseFloat(taxRate) || 0, invoice.amount_paid),
    [numeric, taxRate, invoice.amount_paid]
  );

  const setItem = (i: number, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { description: "", quantity: "1", unit_price: "0" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const validationError = useMemo(() => {
    const cleaned = items.filter((it) => it.description.trim() !== "");
    if (cleaned.length === 0) return "Add at least one line item with a description.";
    for (const it of cleaned) {
      if ((parseFloat(it.quantity) || 0) < 0) return "Quantity cannot be negative.";
      if (Number.isNaN(parseFloat(it.unit_price))) return "Unit price must be a number.";
    }
    const tr = parseFloat(taxRate);
    if (Number.isNaN(tr) || tr < 0 || tr > 100) return "Tax rate must be between 0 and 100.";
    return null;
  }, [items, taxRate]);

  const save = async () => {
    if (saving) return;
    if (validationError) {
      toast(validationError, "error");
      return;
    }
    setSaving(true);
    try {
      const payload = items
        .filter((it) => it.description.trim() !== "")
        .map((it, idx) => ({
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 0,
          unit_price: parseFloat(it.unit_price) || 0,
          sort_order: idx,
        }));
      await updateDraftInvoiceWithItems(invoice.id, {
        tax_rate: parseFloat(taxRate) || 0,
        notes: notes.trim() || null,
        due_date: dueDate || null,
        line_items: payload,
      });
      toast("Draft invoice updated.", "success");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the invoice.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      data-testid="invoice-editor-drawer"
      title={`Edit ${invoice.invoice_number}`}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" className="flex-1" onClick={save} loading={saving} data-testid="invoice-editor-save">
            Save draft
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">Line items</Label>
            <Button variant="ghost" size="sm" onClick={addItem} data-testid="invoice-editor-add-item">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-2" data-testid={`invoice-editor-item-${i}`}>
                <Input
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                  data-testid={`invoice-editor-item-desc-${i}`}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: e.target.value })}
                    className="w-20"
                    data-testid={`invoice-editor-item-qty-${i}`}
                  />
                  <span className="text-slate-400">×</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Unit price"
                    value={it.unit_price}
                    onChange={(e) => setItem(i, { unit_price: e.target.value })}
                    className="flex-1"
                    data-testid={`invoice-editor-item-price-${i}`}
                  />
                  <span className="w-20 text-right text-sm font-medium text-navy">
                    {formatCurrency((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0))}
                  </span>
                  <button
                    onClick={() => removeItem(i)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    data-testid={`invoice-editor-item-remove-${i}`}
                    aria-label="Remove line item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="inv-tax">Tax rate (%)</Label>
            <Input
              id="inv-tax"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              data-testid="invoice-editor-tax"
            />
          </div>
          <div>
            <Label htmlFor="inv-due">Due date</Label>
            <Input
              id="inv-due"
              type="date"
              value={dueDate ? dueDate.slice(0, 10) : ""}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="invoice-editor-due"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="inv-notes">Notes</Label>
          <textarea
            id="inv-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            data-testid="invoice-editor-notes"
          />
        </div>

        {/* Preview totals (display only; DB is authoritative) */}
        <div className="rounded-md bg-cream-100 p-3 text-sm">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold-hover">Preview</p>
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Subtotal</span><span className="font-medium text-navy">{formatCurrency(preview.subtotal)}</span></div>
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Tax</span><span className="font-medium text-navy">{formatCurrency(preview.tax)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-navy"><span>Total</span><span>{formatCurrency(preview.total)}</span></div>
          <p className="mt-1 text-[11px] text-slate-400">Final totals are calculated and stored by the server on save.</p>
        </div>

        {validationError && (
          <p className="text-xs text-red-600" data-testid="invoice-editor-error">{validationError}</p>
        )}
      </div>
    </Drawer>
  );
}
