"use client";

import { useState } from "react";
import { Phone, ArrowRight, CheckCircle2, Pencil } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

// FRONTEND-ONLY (approved): this premium form is visually complete but does
// NOT persist or transmit any data yet. The secure public lead-intake path
// (an anon-safe RPC/Edge Function) will be reviewed and wired in separately.
// When approved, submit `values` to that endpoint inside `handleSubmit`.
type EstimateValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  moveType: string;
  moveDate: string;
};

const EMPTY: EstimateValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  moveType: "",
  moveDate: "",
};

const MOVE_TYPES = [
  "Residential Moving",
  "Commercial Moving",
  "Packing Services",
  "Specialty Items",
  "Local Moving",
  "Long-Distance",
];

const fieldCls =
  "h-11 w-full rounded-sm border border-navy/15 bg-white px-3.5 text-sm text-navy placeholder:text-navy/40 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";

export function EstimateForm() {
  const [values, setValues] = useState<EstimateValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  const set =
    (key: keyof EstimateValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div data-testid="estimate-success" className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/50 bg-navy">
          <CheckCircle2 className="h-7 w-7 text-gold" strokeWidth={1.5} />
        </div>
        <h3 className="mt-5 font-serif text-2xl font-medium text-navy">
          Thank you, {values.firstName || "friend"}.
        </h3>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-navy/70">
          To lock in your estimate and confirm availability the fastest, give us
          a call or text now — we&apos;d love to help with your move.
        </p>
        <a
          href={BRAND.phoneHref}
          data-testid="estimate-success-call-btn"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-gold px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold-hover"
        >
          <Phone className="h-4 w-4" /> Call or text {BRAND.phone}
        </a>
        <button
          onClick={() => setSubmitted(false)}
          data-testid="estimate-edit-btn"
          className="mt-3 inline-flex items-center justify-center gap-2 text-sm font-medium text-navy/60 transition-colors hover:text-navy"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit my details
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} data-testid="estimate-form" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          required
          value={values.firstName}
          onChange={set("firstName")}
          placeholder="First Name"
          aria-label="First name"
          className={fieldCls}
          data-testid="estimate-first-name"
        />
        <input
          required
          value={values.lastName}
          onChange={set("lastName")}
          placeholder="Last Name"
          aria-label="Last name"
          className={fieldCls}
          data-testid="estimate-last-name"
        />
        <input
          type="email"
          value={values.email}
          onChange={set("email")}
          placeholder="Email"
          aria-label="Email"
          className={fieldCls}
          data-testid="estimate-email"
        />
        <input
          type="tel"
          required
          value={values.phone}
          onChange={set("phone")}
          placeholder="Phone"
          aria-label="Phone"
          className={fieldCls}
          data-testid="estimate-phone"
        />
        <select
          value={values.moveType}
          onChange={set("moveType")}
          aria-label="Move type"
          className={cn(fieldCls, !values.moveType && "text-navy/40")}
          data-testid="estimate-move-type"
        >
          <option value="">Move Type</option>
          {MOVE_TYPES.map((t) => (
            <option key={t} value={t} className="text-navy">
              {t}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={values.moveDate}
          onChange={set("moveDate")}
          aria-label="Move date"
          className={cn(fieldCls, !values.moveDate && "text-navy/40")}
          data-testid="estimate-move-date"
        />
      </div>

      <button
        type="submit"
        data-testid="estimate-submit-btn"
        className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-gold px-6 py-4 text-sm font-semibold uppercase tracking-wide text-navy transition-colors duration-300 hover:bg-gold-hover"
      >
        Get Free Estimate
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </button>

      <p className="text-center text-xs text-navy/50">
        We respect your privacy. Your information will never be shared.
      </p>
    </form>
  );
}
