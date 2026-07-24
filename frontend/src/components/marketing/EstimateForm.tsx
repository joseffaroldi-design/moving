"use client";

import { useState } from "react";
import { Phone, ArrowRight, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";

// Shape of an estimate request. NOTE: This is intentionally frontend-only.
// No data is stored, transmitted, or logged. When a secure public
// lead-intake endpoint exists, submit `values` to it inside `handleSubmit`.
type EstimateValues = {
  name: string;
  phone: string;
  email: string;
  moveDate: string;
  fromZip: string;
  toZip: string;
  homeSize: string;
  serviceType: string;
  notes: string;
};

const EMPTY: EstimateValues = {
  name: "",
  phone: "",
  email: "",
  moveDate: "",
  fromZip: "",
  toZip: "",
  homeSize: "",
  serviceType: "Local move",
  notes: "",
};

const HOME_SIZES = [
  "Studio / 1 bedroom",
  "2 bedrooms",
  "3 bedrooms",
  "4+ bedrooms",
  "Office / commercial",
  "A few items",
];

const SERVICE_TYPES = [
  "Local move",
  "Long-distance move",
  "Packing help",
  "Loading / unloading",
  "Junk removal / clean-out",
];

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-navy">{value}</span>
    </div>
  );
}

export function EstimateForm() {
  const [values, setValues] = useState<EstimateValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof EstimateValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Frontend-only: build a local summary. Do NOT persist or transmit.
    // Future: POST `values` to the secure public lead-intake endpoint here.
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div data-testid="estimate-summary" className="p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-2 text-navy">
          <CheckCircle2 className="h-6 w-6 text-gold" />
          <h3 className="font-heading text-lg font-semibold">
            Your estimate request
          </h3>
        </div>

        <div className="rounded-md border border-slate-200 bg-cream-100 px-4 py-2">
          <SummaryRow label="Name" value={values.name} />
          <SummaryRow label="Phone" value={values.phone} />
          <SummaryRow label="Email" value={values.email} />
          <SummaryRow label="Service" value={values.serviceType} />
          <SummaryRow label="Move date" value={values.moveDate} />
          <SummaryRow label="From ZIP" value={values.fromZip} />
          <SummaryRow label="To ZIP" value={values.toZip} />
          <SummaryRow label="Home size" value={values.homeSize} />
          <SummaryRow label="Notes" value={values.notes} />
        </div>

        <div className="mt-6 rounded-md border border-gold/40 bg-gold-soft/40 p-4">
          <p className="font-heading text-sm font-semibold text-navy">
            Online submission is coming soon.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Nothing was sent yet — call or text us now to lock in your estimate
            and check availability.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a href={BRAND.phoneHref} className="sm:flex-1">
              <Button
                variant="gold"
                size="lg"
                className="w-full"
                data-testid="estimate-summary-call-btn"
              >
                <Phone className="h-4 w-4" /> Call or text {BRAND.phone}
              </Button>
            </a>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setSubmitted(false)}
              data-testid="estimate-edit-btn"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="estimate-form"
      className="p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="est-name">Full name</Label>
          <Input
            id="est-name"
            required
            value={values.name}
            onChange={set("name")}
            placeholder="Jordan Landry"
            data-testid="estimate-name-input"
          />
        </div>

        <div>
          <Label htmlFor="est-phone">Phone</Label>
          <Input
            id="est-phone"
            type="tel"
            required
            value={values.phone}
            onChange={set("phone")}
            placeholder="(504) 555-0100"
            data-testid="estimate-phone-input"
          />
        </div>
        <div>
          <Label htmlFor="est-email">Email</Label>
          <Input
            id="est-email"
            type="email"
            value={values.email}
            onChange={set("email")}
            placeholder="you@email.com"
            data-testid="estimate-email-input"
          />
        </div>

        <div>
          <Label htmlFor="est-service">Service needed</Label>
          <Select
            id="est-service"
            className="h-9 w-full"
            value={values.serviceType}
            onChange={set("serviceType")}
            data-testid="estimate-service-select"
          >
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="est-date">Preferred move date</Label>
          <Input
            id="est-date"
            type="date"
            value={values.moveDate}
            onChange={set("moveDate")}
            data-testid="estimate-date-input"
          />
        </div>

        <div>
          <Label htmlFor="est-from">Moving from (ZIP)</Label>
          <Input
            id="est-from"
            inputMode="numeric"
            value={values.fromZip}
            onChange={set("fromZip")}
            placeholder="70115"
            data-testid="estimate-from-input"
          />
        </div>
        <div>
          <Label htmlFor="est-to">Moving to (ZIP)</Label>
          <Input
            id="est-to"
            inputMode="numeric"
            value={values.toZip}
            onChange={set("toZip")}
            placeholder="70118"
            data-testid="estimate-to-input"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="est-size">Home size</Label>
          <Select
            id="est-size"
            className="h-9 w-full"
            value={values.homeSize}
            onChange={set("homeSize")}
            data-testid="estimate-size-select"
          >
            <option value="">Select a size…</option>
            {HOME_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="est-notes">Anything else? (optional)</Label>
          <textarea
            id="est-notes"
            rows={3}
            value={values.notes}
            onChange={set("notes")}
            placeholder="Stairs, elevator, heavy items, parking notes…"
            data-testid="estimate-notes-input"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <Button
        type="submit"
        variant="navy"
        size="lg"
        className="mt-6 w-full"
        data-testid="estimate-submit-btn"
      >
        Review my estimate request <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="mt-3 text-center text-xs text-slate-400">
        We won&apos;t store or share your info — this preview keeps everything on
        your device.
      </p>
    </form>
  );
}
