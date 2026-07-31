"use client";

import { useEffect, useState } from "react";
import { Activity, Building2, CheckCircle2, Circle, User, Phone, Mail } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getHealth } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import {
  fetchBusinessProfile,
  saveBusinessProfile,
  FALLBACK_PROFILE,
  type BusinessProfile,
} from "@/lib/businessProfile";

export default function SettingsPage() {
  const { data } = useDashboardData();
  const { user, me, role } = useAuth();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fromDb, setFromDb] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile>(FALLBACK_PROFILE);

  // Resolve the signed-in user's company_id (never an arbitrary global row).
  const companyId =
    (me?.profile as { company_id?: string } | null)?.company_id ??
    (me?.company as { id?: string } | null)?.id ??
    data?.company?.id ??
    null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBusinessProfile(companyId)
      .then(({ profile, fromDb }) => {
        if (!active) return;
        setProfile(profile);
        setFromDb(fromDb);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [companyId]);

  function set<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function onSave() {
    if (!profile.business_name?.trim()) {
      toast("Business name is required.", "error");
      return;
    }
    if (!companyId) {
      toast("No company is associated with your account.", "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveBusinessProfile(profile, companyId);
      setProfile(saved);
      setFromDb(true);
      toast("Business profile saved.", "success");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Could not save. Ensure the business_profile table exists.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function runHealthCheck() {
    setChecking(true);
    try {
      await getHealth();
      toast("Backend is healthy and reachable.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Health check failed.", "error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business profile, account, and system status."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Settings" }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Business Profile"
            action={
              <div className="flex items-center gap-2">
                {!loading && !fromDb && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Using defaults — not saved yet
                  </span>
                )}
                <Button variant="gold" size="sm" loading={saving} onClick={onSave} data-testid="save-business-profile">
                  Save
                </Button>
              </div>
            }
          />
          {loading ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="biz-name">Business name</Label>
                <Input id="biz-name" data-testid="biz-name" value={profile.business_name}
                  onChange={(e) => set("business_name", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="biz-phone">Phone</Label>
                <Input id="biz-phone" data-testid="biz-phone" value={profile.phone}
                  onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="biz-email">Email</Label>
                <Input id="biz-email" data-testid="biz-email" value={profile.email}
                  onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="biz-address">Address</Label>
                <Input id="biz-address" value={profile.address ?? ""}
                  onChange={(e) => set("address", e.target.value)} placeholder="New Orleans, LA" />
              </div>
              <div>
                <Label htmlFor="biz-website">Website</Label>
                <Input id="biz-website" value={profile.website ?? ""}
                  onChange={(e) => set("website", e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label htmlFor="biz-t1">Primary tagline</Label>
                <Input id="biz-t1" value={profile.tagline_primary}
                  onChange={(e) => set("tagline_primary", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="biz-t2">Secondary tagline</Label>
                <Input id="biz-t2" value={profile.tagline_secondary}
                  onChange={(e) => set("tagline_secondary", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="biz-tax">Default tax rate (%)</Label>
                <Input id="biz-tax" type="number" step="0.001" value={profile.default_tax_rate ?? 0}
                  onChange={(e) => set("default_tax_rate", Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="biz-dep">Default deposit (%)</Label>
                <Input id="biz-dep" type="number" step="0.1" value={profile.default_deposit_percentage ?? 0}
                  onChange={(e) => set("default_deposit_percentage", Number(e.target.value))} />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Account" />
          <div className="space-y-3 p-4 text-sm">
            <Row icon={Building2} label="Company" value={data?.company?.name || profile.business_name || BRAND.name} />
            <Row icon={User} label="Signed in as" value={user?.email || "Not signed in"} />
            <Row icon={User} label="Role" value={role ? titleCase(String(role)) : "—"} />
            <Row icon={Phone} label="Phone" value={profile.phone} />
            <Row icon={Mail} label="Email" value={profile.email} />
          </div>
        </Card>

        <Card>
          <CardHeader title="System" />
          <div className="p-4">
            <p className="mb-3 text-sm text-muted">
              Verify connectivity to the Southern Magnolia Movers backend and Edge Functions.
            </p>
            <Button variant="outline" onClick={runHealthCheck} loading={checking} data-testid="health-check-button">
              <Activity className="h-4 w-4" /> Run health check
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Onboarding" />
          <div className="p-4">
            {data && data.onboarding.steps.length > 0 ? (
              <ul className="space-y-1">
                {data.onboarding.steps.map((s, i) => {
                  const done = s.completed === true || s.is_complete === true ||
                    String(s.status ?? "").toLowerCase() === "completed";
                  const label = (s.title as string) || (s.name as string) || (s.label as string) || `Step ${i + 1}`;
                  return (
                    <li key={i} className="flex items-center gap-2 py-1 text-sm">
                      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}
                      <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>{titleCase(label)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">No onboarding steps.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0">
      <span className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4 text-gold-hover" /> {label}
      </span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}
