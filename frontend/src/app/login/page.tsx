"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/toast";
import { homeForRole } from "@/lib/nav";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { role } = await signIn(email, password);
        toast("Signed in successfully.", "success");
        router.push(homeForRole(role));
      } else {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          toast("Check your email to confirm your account.", "info");
          setMode("login");
        } else {
          toast("Account created.", "success");
          router.push("/dashboard");
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Authentication failed.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left: form */}
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <span className="font-heading text-xl font-bold text-navy">
              MoveOps
            </span>
          </Link>

          <h1 className="font-heading text-2xl font-bold text-navy">
            {mode === "login" ? "Sign in to your account" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login"
              ? "Enter your credentials to access the operations console."
              : "Set up the first owner account for your company."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                <Label htmlFor="password" className="mb-0">
                  Password
                </Label>
                {mode === "login" && (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                data-testid="login-password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
              />
            </div>

            {err && (
              <p
                data-testid="login-error"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {err}
              </p>
            )}

            <Button
              type="submit"
              variant="navy"
              className="w-full"
              size="lg"
              loading={loading}
              data-testid="login-submit"
            >
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>
                No account yet?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setErr(null);
                  }}
                  className="font-medium text-accent hover:underline"
                  data-testid="switch-to-signup"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setErr(null);
                  }}
                  className="font-medium text-accent hover:underline"
                  data-testid="switch-to-login"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <p className="mt-8 text-center text-xs text-slate-400">
            Just exploring?{" "}
            <Link href="/dashboard" className="text-slate-500 hover:underline">
              View the live demo dashboard
            </Link>
          </p>
        </div>
      </div>

      {/* Right: image */}
      <div
        className="relative hidden bg-navy lg:block lg:w-1/2"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, rgba(11,21,39,0.75), rgba(11,21,39,0.92)), url('https://images.pexels.com/photos/33897865/pexels-photo-33897865.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute bottom-0 left-0 p-12 text-white">
          <p className="font-heading text-3xl font-bold leading-tight">
            Every move, under control.
          </p>
          <p className="mt-3 max-w-md text-slate-300">
            From the first call to the final invoice — MoveOps keeps your sales,
            dispatch, and crews working from a single source of truth.
          </p>
        </div>
      </div>
    </div>
  );
}
