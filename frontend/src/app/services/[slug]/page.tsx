import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Home,
  Building2,
  Package,
  Gem,
  MapPin,
  Route,
  Phone,
  ArrowRight,
  Check,
  ChevronRight,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { getService, SERVICE_SLUGS } from "@/lib/services";
import { FEATURED_CITIES } from "@/lib/cities";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { EstimateSection } from "@/components/marketing/EstimateSection";
import { JsonLd } from "@/components/seo/JsonLd";
import { serviceSchema, breadcrumbSchema, faqSchema } from "@/lib/schema";

const ICONS = { Home, Building2, Package, Gem, MapPin, Route } as const;

export function generateStaticParams() {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return { title: "Service Not Found — Southern Magnolia Movers" };
  const path = `/services/${service.slug}`;
  return {
    title: service.metaTitle,
    description: service.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      title: service.metaTitle,
      description: service.metaDescription,
      url: path,
      type: "website",
      siteName: BRAND.name,
      images: [{ url: service.heroImage, alt: service.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: service.metaTitle,
      description: service.metaDescription,
      images: [service.heroImage],
    },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  const Icon = ICONS[service.icon];
  const related = service.related.map((s) => getService(s)).filter(Boolean);

  return (
    <div className="min-h-screen bg-cream font-sans text-navy antialiased">
      <JsonLd
        data={[
          serviceSchema(service),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Services", path: "/#services" },
            { name: service.name, path: `/services/${service.slug}` },
          ]),
          faqSchema(service.faqs),
        ]}
      />
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-navy pb-20 pt-28 md:pb-28 md:pt-36">
          <div className="grain absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 md:px-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex flex-wrap items-center gap-1.5 text-xs text-cream/50">
                  <li>
                    <Link href="/" className="transition-colors hover:text-gold">Home</Link>
                  </li>
                  <li aria-hidden><ChevronRight className="h-3 w-3" /></li>
                  <li>
                    <Link href="/#services" className="transition-colors hover:text-gold">Services</Link>
                  </li>
                  <li aria-hidden><ChevronRight className="h-3 w-3" /></li>
                  <li className="text-cream/80" aria-current="page">{service.name}</li>
                </ol>
              </nav>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-navy-900">
                <Icon className="h-6 w-6 text-gold" strokeWidth={1.5} />
              </div>
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                Our Services
              </p>
              <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-tight text-cream sm:text-5xl">
                {service.h1}
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-cream/70">
                {service.intro}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#estimate"
                  data-testid="service-estimate-cta"
                  className="group inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold-hover"
                >
                  Get Free Estimate
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </a>
                <a
                  href={BRAND.phoneHref}
                  className="inline-flex items-center justify-center gap-2 rounded-sm border border-cream/25 px-6 py-3.5 text-sm font-medium text-cream transition-colors hover:border-gold hover:text-gold"
                >
                  <Phone className="h-4 w-4" /> Call {BRAND.phone}
                </a>
              </div>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-cream/10 shadow-[0_20px_60px_rgb(0,0,0,0.3)]">
              <Image
                src={service.heroImage}
                alt={`${service.name} — Southern Magnolia Movers, New Orleans`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent" />
            </div>
          </div>
        </section>

        {/* What's included */}
        <section className="bg-cream py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">
              What&apos;s Included
            </p>
            <div className="gold-rule mt-4" />
            <h2 className="mt-6 max-w-2xl font-serif text-3xl font-medium leading-tight tracking-tight text-navy md:text-4xl">
              {service.name} done with care.
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
              {service.features.map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-cream-100">
                    <Check className="h-4 w-4 text-gold-hover" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-medium text-navy">{f.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-navy/70">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service-specific FAQ (visible + matches JSON-LD) */}
        <section className="bg-cream-100 py-20 md:py-28" aria-labelledby="service-faq-title">
          <div className="mx-auto max-w-3xl px-6 md:px-10">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">
              Questions & Answers
            </p>
            <h2 id="service-faq-title" className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight text-navy md:text-4xl">
              Good to know.
            </h2>
            <dl className="mt-10 divide-y divide-navy/10">
              {service.faqs.map((f) => (
                <div key={f.q} className="py-5">
                  <dt className="font-serif text-lg font-medium text-navy">{f.q}</dt>
                  <dd className="mt-2 text-base leading-relaxed text-navy/70">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Related services — internal linking */}
        <section className="bg-cream py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <h2 className="font-serif text-2xl font-medium text-navy md:text-3xl">Related services</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r!.slug}
                  href={`/services/${r!.slug}`}
                  data-testid={`related-${r!.slug}`}
                  className="group flex items-center justify-between gap-4 rounded-sm border border-navy/10 bg-cream-100 px-5 py-4 transition-colors hover:border-gold"
                >
                  <span className="font-serif text-lg font-medium text-navy">{r!.name}</span>
                  <ArrowRight className="h-4 w-4 text-gold-hover transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Cities we serve — internal linking */}
        <section className="bg-cream-100 py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-serif text-2xl font-medium text-navy md:text-3xl">
                {service.name} across the New Orleans area
              </h2>
              <Link href="/service-areas" className="group inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold-hover">
                All service areas
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {FEATURED_CITIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/service-areas/${c.slug}`}
                  data-testid={`service-city-${c.slug}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-navy/15 bg-cream px-4 py-2 text-sm text-navy/75 transition-colors hover:border-gold hover:text-gold-hover"
                >
                  <MapPin className="h-3.5 w-3.5 text-gold-hover" strokeWidth={1.5} />
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Estimate form + service area (shared) */}
        <EstimateSection />
      </main>

      <SiteFooter />
    </div>
  );
}
