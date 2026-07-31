"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, ArrowRight, CheckCircle2, Pencil, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  submitEstimate,
  newIdempotencyKey,
  INTAKE_ENABLED,
  type EstimatePayload,
} from "@/lib/publicIntake";
import {
  validateEstimate,
  MOVE_TYPES,
  type EstimateFormValues,
} from "@/lib/estimateValidation";

// Behavior:
//  - INTAKE_ENABLED=false (default): frontend-only. On a valid form it shows a
//    local success state that prompts a call/text (no data saved; no false
//    "saved" claim). The browser NEVER sends key_hash/payload_hash/company_id.
//  - INTAKE_ENABLED=true: submits business fields to the secure Edge Function,
//    which owns hashing, idempotency, and tenant resolution. Success shows ONLY
//    after the server confirms; failures keep entered values + call/text fallback.
const EMPTY: EstimateFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  moveType: "",
  moveDate: "",
};

const fieldCls =
  "h-11 w-full rounded-sm border border-navy/15 bg-white px-3.5 text-sm text-navy placeholder:text-navy/40 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";
const errCls = "border-red-400 focus:border-red-400 focus:ring-red-400";

export function EstimateForm() {
  const [values, setValues] = useState<EstimateFormValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");

  const savingRef = useRef(false);
  const idemRef = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  const set =
    (key: keyof EstimateFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      setValues((s) => ({ ...s, [key]: v }));
      setFieldErrors((fe) => {
        if (!fe[key] && !fe.contact) return fe;
        const next = { ...fe };
        delete next[key];
        if (key === "email" || key === "phone") delete next.contact;
        return next;
      });
    };

  const err = (k: string) => fieldErrors[k];
  const describedBy = (k: string) => (err(k) ? `est-err-${k}` : undefined);

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.focus();
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    setErrorMsg(null);

    // Client validation mirrors server bounds (server stays authoritative).
    const { ok, errors } = validateEstimate(values);
    if (!ok) {
      setFieldErrors(errors);
      focusFirstError();
      return;
    }
    setFieldErrors({});

    // Honeypot: silently "succeed" without doing anything.
    if (honeypot.trim() !== "") {
      setSubmitted(true);
      return;
    }

    // Frontend-only mode: keep placeholder behavior (no network, no data).
    if (!INTAKE_ENABLED) {
      setSubmitted(true);
      return;
    }

    if (!idemRef.current) idemRef.current = newIdempotencyKey();
    savingRef.current = true;
    setSaving(true);
    try {
      // Browser submits ONLY business fields. No key_hash / payload_hash / company_id.
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
        idemRef.current = newIdempotencyKey();
      } else {
        setErrorMsg(res.message);
        if (res.errors) {
          // Map server field keys (snake_case) to our camelCase where possible.
          const map: Record<string, string> = {
            first_name: "firstName",
            last_name: "lastName",
            email: "email",
            phone: "phone",
            contact: "contact",
          };
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.errors)) mapped[map[k] ?? k] = v;
          setFieldErrors(mapped);
          focusFirstError();
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-testid="estimate-success"
        className="text-center focus:outline-none"
      >
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
    <form ref={formRef} onSubmit={handleSubmit} data-testid="estimate-form" className="space-y-4" noValidate>
      {/* Honeypot — visually hidden; real users never fill this. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company website
          <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <input
            value={values.firstName}
            onChange={set("firstName")}
            placeholder="First Name"
            aria-label="First name"
            aria-invalid={!!err("firstName")}
            aria-describedby={describedBy("firstName")}
            className={cn(fieldCls, err("firstName") && errCls)}
            data-testid="estimate-first-name"
          />
          {err("firstName") && <p id="est-err-firstName" className="mt-1 text-xs text-red-600">{err("firstName")}</p>}
        </div>
        <div>
          <input
            value={values.lastName}
            onChange={set("lastName")}
            placeholder="Last Name"
            aria-label="Last name"
            aria-invalid={!!err("lastName")}
            aria-describedby={describedBy("lastName")}
            className={cn(fieldCls, err("lastName") && errCls)}
            data-testid="estimate-last-name"
          />
          {err("lastName") && <p id="est-err-lastName" className="mt-1 text-xs text-red-600">{err("lastName")}</p>}
        </div>
        <div>
          <input
            type="email"
            value={values.email}
            onChange={set("email")}
            placeholder="Email"
            aria-label="Email"
            aria-invalid={!!err("email")}
            aria-describedby={describedBy("email")}
            className={cn(fieldCls, err("email") && errCls)}
            data-testid="estimate-email"
          />
          {err("email") && <p id="est-err-email" className="mt-1 text-xs text-red-600">{err("email")}</p>}
        </div>
        <div>
          <input
            type="tel"
            value={values.phone}
            onChange={set("phone")}
            placeholder="Phone"
            aria-label="Phone"
            aria-invalid={!!err("phone")}
            aria-describedby={describedBy("phone")}
            className={cn(fieldCls, err("phone") && errCls)}
            data-testid="estimate-phone"
          />
          {err("phone") && <p id="est-err-phone" className="mt-1 text-xs text-red-600">{err("phone")}</p>}
        </div>
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
        <div>
          <input
            type="date"
            value={values.moveDate}
            onChange={set("moveDate")}
            aria-label="Move date"
            aria-invalid={!!err("moveDate")}
            aria-describedby={describedBy("moveDate")}
            className={cn(fieldCls, !values.moveDate && "text-navy/40", err("moveDate") && errCls)}
            data-testid="estimate-move-date"
          />
          {err("moveDate") && <p id="est-err-moveDate" className="mt-1 text-xs text-red-600">{err("moveDate")}</p>}
        </div>
      </div>

      {err("contact") && (
        <p id="est-err-contact" className="text-xs text-red-600" data-testid="estimate-contact-error">
          {err("contact")}
        </p>
      )}

      {errorMsg && (
        <div role="alert" data-testid="estimate-error" className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
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
        aria-busy={saving}
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
