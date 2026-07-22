"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-8 shadow-card">
        <Link href="/" className="mb-6 inline-block">
          <Logo variant="dark" />
        </Link>

        {sent ? (
          <div data-testid="reset-sent">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
              <MailCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-navy">
              Check your email
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              If an account exists for <strong>{email}</strong>, a password reset
              link is on its way.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-bold text-navy">
              Reset your password
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="reset-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                />
              </div>
              {err && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </p>
              )}
              <Button
                type="submit"
                variant="navy"
                className="w-full"
                loading={loading}
                data-testid="reset-submit"
              >
                Send reset link
              </Button>
            </form>
          </>
        )}

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-hover hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
