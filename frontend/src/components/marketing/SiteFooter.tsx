import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
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

const COMPANY = [
  { label: "Why Us", href: "/#why-us" },
  { label: "Our Process", href: "/#process" },
  { label: "Service Areas", href: "/service-areas" },
  { label: "FAQs", href: "/#faqs" },
  { label: "Contact", href: "/#estimate" },
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
                <li key={s.href}>
                  <Link href={s.href} className="text-sm text-cream/60 transition-colors hover:text-gold">
                    {s.label}
                  </Link>
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
