"use client";

import { AppShell } from "@/components/shell/AppShell";
import { PORTAL_NAV } from "@/lib/nav";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell nav={PORTAL_NAV} section="Customer Portal">
      {children}
    </AppShell>
  );
}
