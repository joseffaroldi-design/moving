"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalNotCustomer } from "@/components/portal/PortalStates";
import {
  portalListQuotes,
  portalUpdateContact,
  isNotCustomerError,
  safeErrorMessage,
} from "@/lib/portal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PortalProfile() {
  const { loading: authLoading, session, user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [gateError, setGateError] = useState<string | null>(null);
  const [notCustomer, setNotCustomer] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Gate: confirm the signed-in user is a linked customer before showing the
  // form. Uses a portal RPC (no direct customers read).
  const gate = useCallback(async () => {
    setLoading(true);
    setGateError(null);
    setNotCustomer(false);
    try {
      await portalListQuotes(1, 0);
    } catch (e) {
      if (isNotCustomerError(e)) setNotCustomer(true);
      else setGateError(safeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && session) gate();
    else if (!authLoading && !session) setLoading(false);
  }, [authLoading, session, gate]);

  function clearForm() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;

    const anyFilled = [firstName, lastName, email, phone].some((v) => v.trim() !== "");
    if (!anyFilled) {
      toast("Enter at least one field to update.", "info");
      return;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      toast("Please enter a valid email address.", "error");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await portalUpdateContact({ firstName, lastName, email, phone });
      toast("Your contact information has been updated.", "success");
      clearForm();
    } catch (err) {
      toast(safeErrorMessage(err), "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div data-testid="portal-profile">
      <PageHeader
        title="Profile"
        breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Profile" }]}
        description="Update the contact details we use to reach you about your move."
      />

      {authLoading || loading ? (
        <Skeleton className="h-72 w-full max-w-lg" />
      ) : notCustomer ? (
        <PortalNotCustomer />
      ) : gateError ? (
        <ErrorState message={gateError} onRetry={gate} />
      ) : (
        <div className="max-w-lg space-y-4">
          {user?.email && (
            <Card className="p-4" data-testid="profile-account">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Signed in as
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-navy">
                <UserRound className="h-4 w-4 text-gold-hover" />
                {user.email}
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Update contact information" />
            <form onSubmit={handleSubmit} className="space-y-4 p-4" data-testid="profile-form">
              <p className="rounded-md bg-cream px-3 py-2 text-xs text-slate-500">
                Leave a field blank to keep its current value. For your privacy, current values
                are not shown here.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    First name
                  </label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    data-testid="profile-first-name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Last name
                  </label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    data-testid="profile-last-name"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="profile-email"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(504) 555-0123"
                  data-testid="profile-phone"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" loading={saving} data-testid="profile-save">
                  Save changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
