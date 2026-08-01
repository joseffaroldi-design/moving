import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { CITIES } from "@/lib/cities";
import { SITE_URL } from "@/lib/siteUrl";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ServiceAreaMap } from "@/components/marketing/ServiceAreaMap";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Service Areas — New Orleans & Southeast Louisiana | Southern Magnolia Movers",
  description:
    "Southern Magnolia Movers serves the Greater New Orleans area across Orleans and Jefferson Parishes — from the French Quarter to Kenner. Find your city.",
  alternates: { canonical: "/service-areas" },
  openGraph: {
    title: "Service Areas — New Orleans & Southeast Louisiana",
    description:
      "Local moving across Orleans and Jefferson Parishes — from the French Quarter to Kenner. Find your neighborhood.",
    url: "/service-areas",
    type: "website",
    siteName: BRAND.name,
    images: [{ url: "/brand/og-share.jpg", width: 1200, height: 630, alt: "Southern Magnolia Movers service areas" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Service Areas — New Orleans & Southeast Louisiana",
    description: "Local moving across Orleans and Jefferson Parishes. Find your neighborhood.",
    images: ["/brand/og-share.jpg"],
  },
};

export default function ServiceAreasPage() {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Service Areas — Southern Magnolia Movers",
    itemListElement: CITIES.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${c.name}, LA`,
      url: `${SITE_URL}/service-areas/${c.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-cream font-sans text-navy antialiased">
      <JsonLd
        data={[
          itemList,
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Service Areas", path: "/service-areas" },
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        {/* Hero + map */}
        <section className="relative overflow-hidden bg-navy pb-16 pt-28 md:pb-20 md:pt-36">
          <div className="grain absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 md:px-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold">Service Areas</p>
              <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-tight text-cream sm:text-5xl">
                Serving the Greater New Orleans Area
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-cream/70">
                Southern Magnolia Movers is proud to serve homes and businesses across Orleans and
                Jefferson Parishes. From the historic streets of the French Quarter to the family
                neighborhoods of Kenner, our local crews know the way. Choose your area below.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="/#estimate" className="group inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold-hover">
                  Get Free Estimate
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </a>
                <a href={BRAND.phoneHref} className="inline-flex items-center justify-center gap-2 rounded-sm border border-cream/25 px-6 py-3.5 text-sm font-medium text-cream transition-colors hover:border-gold hover:text-gold">
                  <Phone className="h-4 w-4" /> Call {BRAND.phone}
                </a>
              </div>
            </div>
            <div className="rounded-sm border border-cream/10 bg-navy-900/50 p-4 md:p-6">
              <ServiceAreaMap />
            </div>
          </div>
        </section>

        {/* Regional overview + city cards */}
        <section className="bg-cream py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">All Areas</p>
            <div className="gold-rule mt-4" />
            <h2 className="mt-6 max-w-2xl font-serif text-3xl font-medium leading-tight tracking-tight text-navy md:text-4xl">
              Orleans &amp; Jefferson Parishes.
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CITIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/service-areas/${c.slug}`}
                  data-testid={`area-card-${c.slug}`}
                  className="group flex h-full flex-col rounded-sm border border-navy/10 bg-cream-100 p-6 transition-all hover:border-gold hover:shadow-[0_12px_40px_rgb(14,42,74,0.08)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-serif text-xl font-medium text-navy">
                      <MapPin className="h-4 w-4 text-gold-hover" strokeWidth={1.5} /> {c.name}
                    </span>
                    <ArrowRight className="h-4 w-4 text-gold-hover transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-navy/40">{c.region}</p>
                  <p className="mt-3 text-sm leading-relaxed text-navy/65 line-clamp-3">{c.intro[0]}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
