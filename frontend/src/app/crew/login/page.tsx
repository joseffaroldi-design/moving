"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/toast";
import { homeForRole } from "@/lib/nav";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

const CREW_ROLES = new Set(["crew_lead", "mover"]);

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/mobile") || next.startsWith("//")) return "/mobile/jobs";
  return next;
}

function CrewLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { signIn, signOut, session, role, loading: authLoading } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session && role) {
      router.replace(CREW_ROLES.has(role) ? next : homeForRole(role));
    }
  }, [authLoading, session, role, next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { role: signedRole } = await signIn(email, password);
      if (signedRole && !CREW_ROLES.has(signedRole)) {
        await signOut();
        setErr("This sign-in is for crew members. Use the staff or customer sign-in instead.");
        return;
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
    <div className="flex min-h-screen bg-cream" data-testid="crew-login">
      <div className="flex w-full flex-col justify-between px-6 py-8 sm:px-12 lg:w-[46%]">
        <Logo variant="dark" />

        <div className="mx-auto w-full max-w-sm py-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-gold-hover">
            Crew Portal
          </p>
          <h1 className="font-serif text-3xl font-bold text-navy">Crew sign in</h1>
          <p className="mt-2 text-sm text-muted">
            Access assigned jobs, time clock, photos, checklists, and move-day details.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="crew-login-email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="crew@company.com"
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
                data-testid="crew-login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {err && (
              <p data-testid="crew-login-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}

            <Button type="submit" variant="navy" className="w-full" size="lg" loading={loading} data-testid="crew-login-submit">
              Sign in to Crew Portal
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-xs text-muted">
            <p>Accounts are provisioned by your company administrator.</p>
            <p>
              Office team?{" "}
              <Link href="/login" className="font-semibold text-gold-hover hover:underline">Staff sign in</Link>
              {" · "}
              Customer?{" "}
              <Link href="/portal/login" className="font-semibold text-gold-hover hover:underline">Customer sign in</Link>
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
          <p className="font-serif text-3xl font-bold leading-tight text-cream">Southern Magnolia Crew</p>
          <p className="mt-3 max-w-md text-slate-300">
            Everything your crew needs for move day — jobs, time, photos, and checklists in one place.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CrewLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <CrewLoginInner />
    </Suspense>
  );
}
