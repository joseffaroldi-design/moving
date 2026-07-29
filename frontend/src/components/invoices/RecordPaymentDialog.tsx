"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import { recordInvoicePayment, PAYMENT_METHODS } from "@/lib/invoices";

// A focused modal for recording a manual payment. Client-side validation
// blocks zero / negative / non-numeric / over-balance amounts; the database
// RPC remains the authoritative enforcer.
export function RecordPaymentDialog({
  open,
  onClose,
  invoiceId,
  balance,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  balance: number;
  onRecorded: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(balance > 0 ? balance.toFixed(2) : "");
      setMethod("cash");
      setPaidAt(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [open, balance]);

  const parsed = parseFloat(amount);
  const validationError = useMemo(() => {
    if (amount.trim() === "") return "Enter a payment amount.";
    if (Number.isNaN(parsed)) return "Amount must be a number.";
    if (parsed <= 0) return "Amount must be greater than zero.";
    if (parsed > balance + 0.0001) return `Amount cannot exceed the remaining balance (${formatCurrency(balance)}).`;
    return null;
  }, [amount, parsed, balance]);

  if (!open) return null;

  const submit = async () => {
    if (saving) return;
    if (validationError) {
      toast(validationError, "error");
      return;
    }
    setSaving(true);
    try {
      const res = await recordInvoicePayment(invoiceId, {
        amount: Math.round(parsed * 100) / 100,
        method,
        paid_at: paidAt ? new Date(paidAt).toISOString() : null,
        note: note.trim() || null,
      });
      toast(
        Number(res.balance) <= 0 ? "Payment recorded. Invoice is now paid in full." : "Payment recorded.",
        "success"
      );
      onRecorded();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not record the payment.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/40" onClick={saving ? undefined : onClose} />
      <div
        data-testid="record-payment-dialog"
        className="relative w-full max-w-sm animate-fade-in rounded-md border border-slate-200 bg-white p-5 shadow-dropdown"
      >
        <h3 className="font-heading text-base font-semibold text-navy">Record payment</h3>
        <p className="mt-1 text-sm text-slate-500">
          Remaining balance: <span className="font-semibold text-navy">{formatCurrency(balance)}</span>
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="payment-amount-input"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-method">Method</Label>
              <Select
                id="pay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full"
                data-testid="payment-method-select"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                data-testid="payment-date-input"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="payment-note-input"
            />
          </div>
          {validationError && (
            <p className="text-xs text-red-600" data-testid="payment-validation-error">{validationError}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            loading={saving}
            disabled={!!validationError}
            data-testid="payment-submit-button"
          >
            Record payment
          </Button>
        </div>
      </div>
    </div>
  );
}
