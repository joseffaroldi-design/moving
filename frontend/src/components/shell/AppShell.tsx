"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  Bell,
  ChevronLeft,
  LogOut,
  User as UserIcon,
  Truck,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";
import { useAuth } from "@/components/auth/AuthProvider";
import { initials } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { Logo, CrescentMark } from "@/components/brand/Logo";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/portal" || href === "/mobile")
    return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({
  nav,
  pathname,
  collapsed,
  onNavigate,
}: {
  nav: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-0.5 px-2 py-3">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-testid={`nav-${item.label.toLowerCase()}`}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-l-2 border-gold bg-navy-800 text-white"
                : "border-l-2 border-transparent text-slate-300 hover:bg-navy-800 hover:text-white",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? item.label : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  nav,
  section,
  children,
}: {
  nav: NavItem[];
  section: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, me, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const email = user?.email ?? "Demo User";
  const displayName =
    (me?.profile as Record<string, unknown> | null)?.full_name?.toString() ||
    (me?.profile as Record<string, unknown> | null)?.first_name?.toString() ||
    email.split("@")[0];
  const companyName =
    (me?.company as Record<string, unknown> | null)?.name?.toString() ||
    BRAND.name;
  const role = (me?.role as string) ?? null;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const activeLabel =
    nav.find((n) => isActive(pathname, n.href))?.label ?? section;

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy transition-all duration-200 md:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center gap-2 border-b border-navy-800 px-4",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <CrescentMark className="h-9 w-9" />
          ) : (
            <Logo variant="light" />
          )}
        </div>
        <NavLinks nav={nav} pathname={pathname} collapsed={collapsed} />
        <button
          data-testid="sidebar-collapse"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 border-t border-navy-800 px-4 py-3 text-xs font-medium text-slate-400 hover:text-gold"
        >
          <ChevronLeft
            className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
          />
          {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-navy/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-navy">
            <div className="flex h-16 items-center justify-between border-b border-navy-800 px-4">
              <Logo variant="light" />
              <button onClick={() => setMobileOpen(false)} className="text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks
              nav={nav}
              pathname={pathname}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-all duration-200",
          collapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-3">
            <button
              data-testid="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-slate-400">{section}</span>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-navy">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="global-search"
                placeholder="Search…"
                className="h-9 w-56 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:border-accent focus:bg-white focus:outline-none"
              />
            </div>
            <button
              data-testid="notifications-button"
              className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
            </button>
            <div className="relative">
              <button
                data-testid="user-menu-button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-slate-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                  {initials(displayName)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-medium leading-tight text-navy">
                    {displayName}
                  </span>
                  <span className="block text-[11px] leading-tight text-slate-500">
                    {role ? role.replace(/_/g, " ") : "Demo mode"}
                  </span>
                </span>
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-dropdown">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <p className="text-sm font-medium text-navy">{displayName}</p>
                      <p className="truncate text-xs text-slate-500">{email}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{companyName}</p>
                    </div>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <UserIcon className="h-4 w-4" /> Settings
                    </Link>
                    {user ? (
                      <button
                        data-testid="logout-button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    ) : (
                      <Link
                        href="/login"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-slate-50"
                      >
                        <LogOut className="h-4 w-4" /> Sign in
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
