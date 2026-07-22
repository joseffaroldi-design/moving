"use client";

import { AppShell } from "@/components/shell/AppShell";
import { DashboardProvider } from "@/components/data/DashboardProvider";
import { STAFF_NAV } from "@/lib/nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardProvider>
      <AppShell nav={STAFF_NAV} section="Operations">
        {children}
      </AppShell>
    </DashboardProvider>
  );
}
