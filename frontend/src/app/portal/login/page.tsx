"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/toast";
import { homeForRole } from "@/lib/nav";
import { getBrowserClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/portal") || next.startsWith("//")) return "/portal";
  return next;
}

function CustomerLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { signIn, signOut, session, role, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = getBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session && role) {
      router.replace(role === "customer" ? next : homeForRole(role));
    }
  }, [authLoading, session, role, next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { role: signedRole } = await signIn(email, password);
      if (signedRole && signedRole !== "customer") {
        await signOut();
        setErr("This sign-in is for customers. Staff and crew have separate sign-in pages.");
        return;
      }

      if (signedRole === "customer") {
        const { error: activationError } = await supabase.rpc(
          "portal_activate_customer_account"
        );
        if (activationError) {
          await signOut();
          setErr(
            "We couldn't match this verified email to one customer record. If this is your first visit, confirm you're using the same email you gave our office, or contact us for help."
          );
          return;
        }
      }

      toast("Signed in successfully.", "success");
      router.replace(next);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-cream" data-testid="customer-login">
      <div className="flex w-full flex-col justify-between px-6 py-8 sm:px-12 lg:w-[46%]">
        <Logo variant="dark" />

        <div className="mx-auto w-full max-w-sm py-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-gold-hover">
            Customer Portal
          </p>
          <h1 className="font-serif text-3xl font-bold text-navy">Customer sign in</h1>
          <p className="mt-2 text-sm text-muted">
            View your quotes, move schedule, invoices, payments, and documents.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="customer-login-email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="password" className="mb-0">Password</Label>
                <Link href="/forgot-password" className="text-xs font-semibold text-gold-hover hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                data-testid="customer-login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {err && (
              <p data-testid="customer-login-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}

            <Button type="submit" variant="navy" className="w-full" size="lg" loading={loading} data-testid="customer-login-submit">
              Sign in to Customer Portal
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-xs text-muted">
            <p>
              First time here?{" "}
              <Link href="/portal/activate" className="font-semibold text-gold-hover hover:underline" data-testid="customer-activate-link">
                Activate your customer account
              </Link>
            </p>
            <p>
              Office team?{" "}
              <Link href="/login" className="font-semibold text-gold-hover hover:underline" data-testid="staff-login-link">
                Staff sign in
              </Link>
              {" · "}
              Crew member?{" "}
              <Link href="/crew/login" className="font-semibold text-gold-hover hover:underline" data-testid="crew-login-link">
                Crew sign in
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
            Your move with {BRAND.name}, at your fingertips — quotes, schedule, invoices, and documents in one place.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <CustomerLoginInner />
    </Suspense>
  );
}
