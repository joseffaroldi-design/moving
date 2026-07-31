"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { PORTAL_NAV } from "@/lib/nav";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The customer login page is public and must NOT render the authenticated shell.
  if (pathname === "/portal/login") return <>{children}</>;

  return (
    <AppShell nav={PORTAL_NAV} section="Customer Portal">
      {children}
    </AppShell>
  );
}
