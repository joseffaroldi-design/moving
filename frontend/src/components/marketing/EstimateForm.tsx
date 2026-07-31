"use client";

import { useRef, useState } from "react";
import { Phone, ArrowRight, CheckCircle2, Pencil, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  submitEstimate,
  newIdempotencyKey,
  INTAKE_ENABLED,
  type EstimatePayload,
} from "@/lib/publicIntake";

// Behavior:
//  - INTAKE_ENABLED = false (default): frontend-only. Shows a local success
//    state that prompts a call/text (no data is saved, no false "saved" claim).
//  - INTAKE_ENABLED = true (after the Edge Function is deployed): submits to the
//    secure public intake endpoint and shows success ONLY after the server
//    confirms persistence; on failure it keeps the entered values, shows an
//    error, and offers the call/text fallback. Double submits are blocked
//    client-side (button + ref guard) AND server-side (DB idempotency).
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
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");

  const savingRef = useRef(false);
  const idemRef = useRef("");

  const set =
    (key: keyof EstimateValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    setErrorMsg(null);
    setFieldErrors({});

    // Frontend-only mode (endpoint not yet enabled): keep existing behavior.
    if (!INTAKE_ENABLED) {
      setSubmitted(true);
      return;
    }

    // Honeypot: silently "succeed" without doing anything.
    if (honeypot.trim() !== "") {
      setSubmitted(true);
      return;
    }

    // Minimal client-side validation before hitting the network.
    const errs: Record<string, string> = {};
    if (!values.firstName.trim()) errs.first_name = "Enter your first name.";
    if (!values.lastName.trim()) errs.last_name = "Enter your last name.";
    if (!values.email.trim() && !values.phone.trim())
      errs.contact = "Add a phone number or email so we can reach you.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }

    if (!idemRef.current) idemRef.current = newIdempotencyKey();
    savingRef.current = true;
    setSaving(true);
    try {
      const payload: EstimatePayload = {
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        move_type: values.moveType || undefined,
        move_date: values.moveDate || undefined,
      };
      const res = await submitEstimate(payload, idemRef.current);
      if (res.ok) {
        setSubmitted(true);
        idemRef.current = newIdempotencyKey(); // fresh key for any next request
      } else {
        setErrorMsg(res.message);
        setFieldErrors(res.errors ?? {});
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
          {INTAKE_ENABLED
            ? "Your estimate request was received. For the fastest confirmation of availability, feel free to call or text us anytime."
            : "To lock in your estimate and confirm availability the fastest, give us a call or text now — we'd love to help with your move."}
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
    <form onSubmit={handleSubmit} data-testid="estimate-form" className="space-y-4" noValidate>
      {/* Honeypot — visually hidden; real users never fill this. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <input
            required
            value={values.firstName}
            onChange={set("firstName")}
            placeholder="First Name"
            aria-label="First name"
            className={cn(fieldCls, fieldErrors.first_name && "border-red-400 focus:border-red-400 focus:ring-red-400")}
            data-testid="estimate-first-name"
          />
          {fieldErrors.first_name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.first_name}</p>
          )}
        </div>
        <div>
          <input
            required
            value={values.lastName}
            onChange={set("lastName")}
            placeholder="Last Name"
            aria-label="Last name"
            className={cn(fieldCls, fieldErrors.last_name && "border-red-400 focus:border-red-400 focus:ring-red-400")}
            data-testid="estimate-last-name"
          />
          {fieldErrors.last_name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.last_name}</p>
          )}
        </div>
        <input
          type="email"
          value={values.email}
          onChange={set("email")}
          placeholder="Email"
          aria-label="Email"
          className={cn(fieldCls, fieldErrors.email && "border-red-400 focus:border-red-400 focus:ring-red-400")}
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

      {fieldErrors.contact && (
        <p className="text-xs text-red-600" data-testid="estimate-contact-error">
          {fieldErrors.contact}
        </p>
      )}

      {errorMsg && (
        <div
          data-testid="estimate-error"
          className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {errorMsg}{" "}
          <a href={BRAND.phoneHref} className="font-semibold underline">
            Call or text {BRAND.phone}
          </a>
          .
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        data-testid="estimate-submit-btn"
        className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-gold px-6 py-4 text-sm font-semibold uppercase tracking-wide text-navy transition-colors duration-300 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          <>
            Get Free Estimate
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </>
        )}
      </button>

      <p className="text-center text-xs text-navy/50">
        We respect your privacy. Your information will never be shared.
      </p>
    </form>
  );
}
