"use client";

import { useEffect, useState } from "react";
import { Phone, ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { BrandLogo } from "./BrandLogo";

const SERVICES = [
  { label: "Residential Moving", href: "/services/residential-moving" },
  { label: "Commercial Moving", href: "/services/commercial-moving" },
  { label: "Local Moving", href: "/services/local-moving" },
  { label: "Long-Distance Moving", href: "/services/long-distance-moving" },
  { label: "Packing Services", href: "/services/packing-services" },
  { label: "Specialty Moving", href: "/services/specialty-moving" },
];

const NAV = [
  { label: "Why Us", href: "/#why-us" },
  { label: "Our Process", href: "/#process" },
  { label: "Service Area", href: "/#service-area" },
  { label: "FAQs", href: "/#faqs" },
  { label: "Contact", href: "/#estimate" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid="site-header"
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-500",
        scrolled
          ? "border-b border-navy/10 bg-cream shadow-[0_6px_24px_rgb(14,42,74,0.08)]"
          : "border-b border-navy/[0.08] bg-cream"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 md:px-10">
        <a href="/" aria-label="Southern Magnolia Movers — home" data-testid="header-logo">
          <BrandLogo height={scrolled ? 46 : 54} priority className="transition-all duration-500" />
        </a>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
          <div className="group relative">
            <button
              className="inline-flex items-center gap-1 py-2 text-sm font-medium text-navy/80 transition-colors hover:text-navy"
              data-testid="nav-services"
            >
              Services
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-1/2 top-full w-60 -translate-x-1/2 translate-y-1 pt-2 opacity-0 transition-all duration-300 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <div className="rounded-sm border border-navy/10 bg-cream-100 p-2 shadow-[0_12px_40px_rgb(14,42,74,0.14)]">
                {SERVICES.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    className="block rounded-sm px-3 py-2 text-sm text-navy/75 transition-colors hover:bg-gold/10 hover:text-navy"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="py-2 text-sm font-medium text-navy/80 transition-colors hover:text-navy"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <a
            href={BRAND.phoneHref}
            data-testid="header-call-btn"
            className="hidden items-center gap-2 rounded-sm border border-navy/20 px-4 py-2.5 text-sm font-medium text-navy transition-colors hover:border-navy hover:bg-navy hover:text-cream md:inline-flex"
          >
            <Phone className="h-4 w-4 text-gold-hover" />
            {BRAND.phone}
          </a>
          <a
            href="#estimate"
            data-testid="header-estimate-btn"
            className="hidden rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold-hover sm:inline-block"
          >
            Get Free Estimate
          </a>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            data-testid="mobile-menu-toggle"
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm text-navy lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "overflow-hidden border-t border-navy/10 bg-cream-100 transition-[max-height,opacity] duration-500 lg:hidden",
          menuOpen ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0"
        )}
        data-testid="mobile-menu"
      >
        <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
          <a href="/#services" onClick={() => setMenuOpen(false)} className="rounded-sm px-2 py-3 text-navy/80 hover:bg-gold/10 hover:text-navy">Services</a>
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-sm px-2 py-3 text-navy/80 hover:bg-gold/10 hover:text-navy"
            >
              {n.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            <a href={BRAND.phoneHref} className="flex items-center justify-center gap-2 rounded-sm border border-navy/20 px-4 py-3 text-sm font-medium text-navy">
              <Phone className="h-4 w-4 text-gold-hover" /> {BRAND.phone}
            </a>
            <a href="#estimate" onClick={() => setMenuOpen(false)} className="rounded-sm bg-gold px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-navy">
              Get Free Estimate
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
