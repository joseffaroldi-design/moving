"use client";

import { useState } from "react";
import { Activity, Building2, CheckCircle2, Circle, User } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getHealth } from "@/lib/api";
import { titleCase } from "@/lib/format";

export default function SettingsPage() {
  const { data } = useDashboardData();
  const { user, me } = useAuth();
  const toast = useToast();
  const [checking, setChecking] = useState(false);

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

  const company =
    (me?.company as Record<string, unknown> | null)?.name?.toString() ||
    data?.company?.name ||
    "MoveOps Demo Company";

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company profile, account, and system status."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Settings" }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Company" />
          <div className="space-y-3 p-4 text-sm">
            <Row icon={Building2} label="Company" value={company} />
            <Row icon={User} label="Signed in as" value={user?.email || "Demo mode (not signed in)"} />
            <Row icon={User} label="Role" value={me?.role ? titleCase(String(me.role)) : "—"} />
          </div>
        </Card>

        <Card>
          <CardHeader title="System" />
          <div className="p-4">
            <p className="mb-3 text-sm text-slate-500">
              Verify connectivity to the MoveOps Supabase backend and Edge Functions.
            </p>
            <Button
              variant="outline"
              onClick={runHealthCheck}
              loading={checking}
              data-testid="health-check-button"
            >
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
                  const done =
                    s.completed === true ||
                    s.is_complete === true ||
                    String(s.status ?? "").toLowerCase() === "completed";
                  const label =
                    (s.title as string) || (s.name as string) || (s.label as string) || `Step ${i + 1}`;
                  return (
                    <li key={i} className="flex items-center gap-2 py-1 text-sm">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-300" />
                      )}
                      <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>
                        {titleCase(label)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No onboarding steps.</p>
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
      <span className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="font-medium text-navy">{value}</span>
    </div>
  );
}
