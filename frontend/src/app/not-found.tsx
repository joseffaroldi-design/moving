import type { Metadata } from "next";
import Link from "next/link";
import { Home, ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/marketing/BrandLogo";
import { SERVICES } from "@/lib/services";
import { FEATURED_CITIES } from "@/lib/cities";

export const metadata: Metadata = {
  title: "Page Not Found — Southern Magnolia Movers",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-navy font-sans text-cream antialiased">
      <div className="grain absolute inset-0" />
      <header className="relative mx-auto w-full max-w-7xl px-6 py-6 md:px-10">
        <Link href="/" aria-label="Southern Magnolia Movers home" data-testid="notfound-logo">
          <BrandLogo height={44} plaque />
        </Link>
      </header>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center md:px-10">
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.3em] text-gold">404</p>
        <h1 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-tight text-cream md:text-5xl">
          This page seems to have moved.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-cream/70">
          We couldn&apos;t find the page you were looking for — but we&apos;d love to help with your
          move. Head back home or explore our services and service areas below.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" data-testid="notfound-home" className="group inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold-hover">
            <Home className="h-4 w-4" /> Back Home
          </Link>
          <Link href="/service-areas" className="inline-flex items-center justify-center gap-2 rounded-sm border border-cream/25 px-6 py-3.5 text-sm font-medium text-cream transition-colors hover:border-gold hover:text-gold">
            Service Areas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12 w-full border-t border-cream/10 pt-8">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold/80">Popular services</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {SERVICES.map((s) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="rounded-full border border-cream/15 px-4 py-2 text-sm text-cream/75 transition-colors hover:border-gold hover:text-gold">
                {s.name}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {FEATURED_CITIES.map((c) => (
              <Link key={c.slug} href={`/service-areas/${c.slug}`} className="rounded-full border border-cream/15 px-4 py-2 text-sm text-cream/75 transition-colors hover:border-gold hover:text-gold">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
