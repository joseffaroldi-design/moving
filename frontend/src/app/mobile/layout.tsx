"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { MOBILE_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { CrescentMark } from "@/components/brand/Logo";
import { useAuth } from "@/components/auth/AuthProvider";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-cream">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2.5 border-b border-navy-800 bg-navy px-4">
        <CrescentMark className="h-7 w-7" />
        <span className="font-serif text-sm font-bold text-cream">
          Southern Magnolia <span className="text-gold">Crew</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          data-testid="mobile-logout"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-navy-800 hover:text-white"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </header>

      <main className="flex-1 p-4 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-slate-200 bg-white">
        {MOBILE_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`mobile-nav-${item.label.toLowerCase()}`}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                active ? "text-gold-hover" : "text-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
