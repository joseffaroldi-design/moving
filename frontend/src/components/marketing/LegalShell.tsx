import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { BRAND } from "@/lib/brand";

export function LegalShell({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen bg-cream font-sans text-navy antialiased">
      <header className="bg-navy-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5 md:px-10">
          <Link href="/" aria-label="Southern Magnolia Movers home" data-testid="legal-home-logo">
            <BrandLogo height={44} plaque />
          </Link>
          <Link
            href="/"
            data-testid="legal-back-link"
            className="text-sm font-medium text-cream/80 transition-colors hover:text-gold"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20" data-testid="legal-content">
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">
          Southern Magnolia Movers
        </p>
        <h1 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-tight text-navy md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-navy/50">Effective date: {effectiveDate}</p>
        <div className="mt-10 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-navy/10 bg-cream-100">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-navy/50 sm:flex-row md:px-10">
          <p>
            © {year} {BRAND.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/" className="transition-colors hover:text-gold-hover">
              Home
            </Link>
            <span className="text-navy/20">•</span>
            <Link href="/privacy" className="transition-colors hover:text-gold-hover">
              Privacy
            </Link>
            <span className="text-navy/20">•</span>
            <Link href="/terms" className="transition-colors hover:text-gold-hover">
              Terms
            </Link>
            <span className="text-navy/20">•</span>
            <Link href="/login" className="transition-colors hover:text-gold-hover">
              Staff Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-medium text-navy">{heading}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-navy/70">{children}</div>
    </section>
  );
}
