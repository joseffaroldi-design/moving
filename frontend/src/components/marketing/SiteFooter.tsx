import Link from "next/link";
import { Phone, Mail, MapPin, Facebook, Instagram } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { BrandLogo } from "./BrandLogo";

const SERVICES = [
  "Residential Moving",
  "Commercial Moving",
  "Packing Services",
  "Specialty Items",
  "Local & Long Distance",
];

const COMPANY = [
  { label: "Why Us", href: "#why-us" },
  { label: "Our Process", href: "#process" },
  { label: "Service Area", href: "#service-area" },
  { label: "FAQs", href: "#faqs" },
  { label: "Contact", href: "#estimate" },
];

const SOCIALS = [
  { icon: Facebook, label: "Facebook", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-navy-900 pt-16" data-testid="site-footer">
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <BrandLogo height={54} plaque />
            <p className="mt-6 max-w-xs font-serif text-lg text-cream/80">
              Moving You Forward.
              <br />
              Cleaning Out the Past.
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/50">
              Professional residential &amp; commercial moving across New
              Orleans and Southeast Louisiana.
            </p>
          </div>

          <div className="md:col-span-2">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Services
            </p>
            <ul className="mt-5 space-y-3">
              {SERVICES.map((s) => (
                <li key={s}>
                  <a href="#services" className="text-sm text-cream/60 transition-colors hover:text-gold">
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Company
            </p>
            <ul className="mt-5 space-y-3">
              {COMPANY.map((c) => (
                <li key={c.label}>
                  <a href={c.href} className="text-sm text-cream/60 transition-colors hover:text-gold">
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Contact
            </p>
            <ul className="mt-5 space-y-3 text-sm text-cream/70">
              <li>
                <a href={BRAND.phoneHref} data-testid="footer-phone" className="inline-flex items-center gap-2 transition-colors hover:text-gold">
                  <Phone className="h-4 w-4 text-gold" strokeWidth={1.5} /> {BRAND.phone}
                </a>
              </li>
              <li>
                <a href={BRAND.emailHref} data-testid="footer-email" className="inline-flex items-center gap-2 transition-colors hover:text-gold">
                  <Mail className="h-4 w-4 text-gold" strokeWidth={1.5} /> {BRAND.email}
                </a>
              </li>
              <li className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold" strokeWidth={1.5} /> New Orleans, Louisiana
              </li>
            </ul>
            <p className="mt-6 font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Follow Us
            </p>
            <div className="mt-4 flex items-center gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/20 text-cream/70 transition-colors hover:border-gold hover:text-gold"
                >
                  <s.icon className="h-4 w-4" strokeWidth={1.5} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-cream/10 py-6 text-xs text-cream/45 sm:flex-row">
          <p>© {year} {BRAND.name}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span>Locally Owned &amp; Operated</span>
            <span className="text-cream/20">•</span>
            <Link href="/privacy" data-testid="footer-privacy-link" className="transition-colors hover:text-gold">Privacy Policy</Link>
            <span className="text-cream/20">•</span>
            <Link href="/terms" data-testid="footer-terms-link" className="transition-colors hover:text-gold">Terms of Service</Link>
            <span className="text-cream/20">•</span>
            <Link href="/login" data-testid="staff-login-link" className="transition-colors hover:text-gold">
              Staff Login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
