"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, Phone, ShieldCheck } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

export default function CustomerPortalActivatePage() {
  const router = useRouter();
  const supabase = getBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const completeActivation = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { error: activationError } = await supabase.rpc(
      "portal_activate_customer_account"
    );
    setLoading(false);

    if (activationError) {
      setError(
        "We couldn't match this verified email to one customer record. Please contact the office so we can confirm the email on your move."
      );
      return false;
    }

    setMessage("Your customer portal is ready.");
    router.replace("/portal");
    router.refresh();
    return true;
  }, [router, supabase]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        await completeActivation();
      }
      if (active) setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, [completeActivation, supabase]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address you used with Southern Magnolia Movers.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/portal/activate?complete=1`,
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      setLoading(false);
      await completeActivation();
      return;
    }

    setLoading(false);
    setConfirmationSent(true);
    setMessage(
      "Check your email to confirm your address. After confirmation, return here or sign in to the Customer Portal to finish activation."
    );
  }

  const finishingExistingSession = checkingSession || (loading && !confirmationSent);

  return (
    <div className="flex min-h-screen bg-cream" data-testid="customer-activate">
      <div className="flex w-full flex-col justify-between px-6 py-8 sm:px-12 lg:w-[46%]">
        <Logo variant="dark" />

        <div className="mx-auto w-full max-w-sm py-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-gold-hover">
            Customer Portal
          </p>
          <h1 className="font-serif text-3xl font-bold text-navy">
            Activate your account
          </h1>
          <p className="mt-2 text-sm text-muted">
            Use the same email address you gave us for your move. We&apos;ll securely match your verified email to your existing customer record.
          </p>

          <div className="mt-5 rounded-lg border border-gold/25 bg-white/55 p-4 text-sm text-navy">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-hover" />
              <p>
                This page creates customer access only. Staff and crew accounts remain invitation-only.
              </p>
            </div>
          </div>

          {finishingExistingSession ? (
            <div className="mt-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
              <p className="mt-3 text-sm text-muted">Finishing your portal setup…</p>
            </div>
          ) : confirmationSent ? (
            <div className="mt-7 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <p className="font-semibold text-emerald-900">Confirmation email sent</p>
                  <p className="mt-1 text-sm text-emerald-800">{message}</p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div>
                <Label htmlFor="activate-email">Email</Label>
                <Input
                  id="activate-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  data-testid="customer-activate-email"
                />
              </div>
              <div>
                <Label htmlFor="activate-password">Create password</Label>
                <Input
                  id="activate-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  data-testid="customer-activate-password"
                />
              </div>
              <div>
                <Label htmlFor="activate-confirm-password">Confirm password</Label>
                <Input
                  id="activate-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Re-enter your password"
                  data-testid="customer-activate-confirm-password"
                />
              </div>

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="customer-activate-error">
                  {error}
                </p>
              )}

              {message && !confirmationSent && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {message}
                </p>
              )}

              <Button
                type="submit"
                variant="navy"
                className="w-full"
                size="lg"
                loading={loading}
                data-testid="customer-activate-submit"
              >
                Activate Customer Portal
              </Button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-muted">
            <p>
              Already activated?{" "}
              <Link href="/portal/login" className="font-semibold text-gold-hover hover:underline">
                Customer sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted sm:flex-row sm:items-center sm:gap-5">
          <a href={BRAND.phoneHref} className="inline-flex items-center gap-1.5 hover:text-navy">
            <Phone className="h-3.5 w-3.5 text-gold-hover" /> {BRAND.phone}
          </a>
          <a href={BRAND.emailHref} className="inline-flex items-center gap-1.5 hover:text-navy">
            <Mail className="h-3.5 w-3.5 text-gold-hover" /> {BRAND.email}
          </a>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-navy lg:block lg:w-[54%]">
        <Image
          src="/brand/login-art.jpg"
          alt="New Orleans skyline with the Crescent City Connection bridge"
          fill
          priority
          className="object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-transparent" />
        <div className="absolute bottom-0 left-0 p-12">
          <p className="font-serif text-3xl font-bold leading-tight text-cream">
            {BRAND.taglinePrimary}
          </p>
          <p className="mt-3 max-w-md text-slate-300">
            One secure place for your move schedule, quotes, invoices, payments, and documents.
          </p>
        </div>
      </div>
    </div>
  );
}
