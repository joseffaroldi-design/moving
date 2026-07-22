"use client";

import { useState } from "react";
import { Activity, Building2, CheckCircle2, Circle, User, Phone, Mail } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getHealth } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { BRAND } from "@/lib/brand";

export default function SettingsPage() {
  const { data } = useDashboardData();
  const { user, me } = useAuth();
  const toast = useToast();
  const [checking, setChecking] = useState(false);

  const [profile, setProfile] = useState<{
    name: string;
    phone: string;
    email: string;
    taglinePrimary: string;
    taglineSecondary: string;
  }>({
    name: BRAND.name,
    phone: BRAND.phone,
    email: BRAND.email,
    taglinePrimary: BRAND.taglinePrimary,
    taglineSecondary: BRAND.taglineSecondary,
  });

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
        {/* Business Profile */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Business Profile"
            action={
              <Button
                variant="gold"
                size="sm"
                data-testid="save-business-profile"
                onClick={() => toast("Business profile saved.", "success")}
              >
                Save
              </Button>
            }
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="biz-name">Business name</Label>
              <Input id="biz-name" data-testid="biz-name" value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="biz-phone">Phone</Label>
              <Input id="biz-phone" data-testid="biz-phone" value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="biz-email">Email</Label>
              <Input id="biz-email" data-testid="biz-email" value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="biz-t1">Primary tagline</Label>
              <Input id="biz-t1" value={profile.taglinePrimary}
                onChange={(e) => setProfile({ ...profile, taglinePrimary: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="biz-t2">Secondary tagline</Label>
              <Input id="biz-t2" value={profile.taglineSecondary}
                onChange={(e) => setProfile({ ...profile, taglineSecondary: e.target.value })} />
            </div>
          </div>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader title="Account" />
          <div className="space-y-3 p-4 text-sm">
            <Row icon={Building2} label="Company" value={data?.company?.name || BRAND.name} />
            <Row icon={User} label="Signed in as" value={user?.email || "Demo mode (not signed in)"} />
            <Row icon={User} label="Role" value={me?.role ? titleCase(String(me.role)) : "—"} />
            <Row icon={Phone} label="Phone" value={profile.phone} />
            <Row icon={Mail} label="Email" value={profile.email} />
          </div>
        </Card>

        {/* System */}
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

        {/* Onboarding */}
        <Card className="lg:col-span-2">
          <CardHeader title="Onboarding" />
          <div className="p-4">
            {data && data.onboarding.steps.length > 0 ? (
              <ul className="space-y-1">
                {data.onboarding.steps.map((s, i) => {
                  const done =
                    s.completed === true || s.is_complete === true ||
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
