"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Phone, Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/toast";
import { homeForRole } from "@/lib/nav";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { role } = await signIn(email, password);
      toast("Signed in successfully.", "success");
      router.push(homeForRole(role));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Left: form */}
      <div className="flex w-full flex-col justify-between px-6 py-8 sm:px-12 lg:w-[46%]">
        <Logo variant="dark" />

        <div className="mx-auto w-full max-w-sm py-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-gold-hover">
            Operations Portal
          </p>
          <h1 className="font-serif text-3xl font-bold text-navy">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to manage leads, quotes, jobs, and dispatch.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="login-email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
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
                data-testid="login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {err && (
              <p data-testid="login-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}

            <Button type="submit" variant="navy" className="w-full" size="lg" loading={loading} data-testid="login-submit">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Accounts are provisioned by your company administrator.
          </p>
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

      {/* Right: brand art */}
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
            The internal operating system for {BRAND.name} — from the first lead to
            the final invoice.
          </p>
        </div>
      </div>
    </div>
  );
}
