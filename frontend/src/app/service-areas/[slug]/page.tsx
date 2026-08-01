import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Phone, ArrowRight, MapPin, Landmark, ChevronRight, Check } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { getCity, CITY_SLUGS } from "@/lib/cities";
import { SERVICES } from "@/lib/services";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { EstimateSection } from "@/components/marketing/EstimateSection";
import { JsonLd } from "@/components/seo/JsonLd";
import { cityLocalBusinessSchema, cityServiceSchema, breadcrumbSchema, faqSchema } from "@/lib/schema";

export function generateStaticParams() {
  return CITY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const city = getCity(slug);
  if (!city) return { title: "Area Not Found — Southern Magnolia Movers" };
  const path = `/service-areas/${city.slug}`;
  return {
    title: city.metaTitle,
    description: city.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      title: city.metaTitle,
      description: city.metaDescription,
      url: path,
      type: "website",
      siteName: BRAND.name,
      images: [{ url: city.heroImage, alt: `${city.name} movers` }],
    },
    twitter: {
      card: "summary_large_image",
      title: city.metaTitle,
      description: city.metaDescription,
      images: [city.heroImage],
    },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const city = getCity(slug);
  if (!city) notFound();

  const nearby = city.nearby.map((s) => getCity(s)).filter(Boolean);

  return (
    <div className="min-h-screen bg-cream font-sans text-navy antialiased">
      <JsonLd
        data={[
          cityLocalBusinessSchema(city),
          cityServiceSchema(city),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Service Areas", path: "/service-areas" },
            { name: city.name, path: `/service-areas/${city.slug}` },
          ]),
          faqSchema(city.faqs),
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
                  <li><Link href="/" className="transition-colors hover:text-gold">Home</Link></li>
                  <li aria-hidden><ChevronRight className="h-3 w-3" /></li>
                  <li><Link href="/service-areas" className="transition-colors hover:text-gold">Service Areas</Link></li>
                  <li aria-hidden><ChevronRight className="h-3 w-3" /></li>
                  <li className="text-cream/80" aria-current="page">{city.name}</li>
                </ol>
              </nav>
              <p className="inline-flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                <MapPin className="h-4 w-4" strokeWidth={1.5} /> {city.region}
              </p>
              <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-tight text-cream sm:text-5xl">
                {city.h1}
              </h1>
              {city.intro.map((p, i) => (
                <p key={i} className="mt-5 max-w-lg text-base leading-relaxed text-cream/70">{p}</p>
              ))}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#estimate" data-testid="city-estimate-cta" className="group inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold-hover">
                  Get Free Estimate
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </a>
                <a href={BRAND.phoneHref} className="inline-flex items-center justify-center gap-2 rounded-sm border border-cream/25 px-6 py-3.5 text-sm font-medium text-cream transition-colors hover:border-gold hover:text-gold">
                  <Phone className="h-4 w-4" /> Call {BRAND.phone}
                </a>
              </div>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-cream/10 shadow-[0_20px_60px_rgb(0,0,0,0.3)]">
              <Image src={city.heroImage} alt={`Moving services in ${city.name}, Louisiana`} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent" />
            </div>
          </div>
        </section>

        {/* Neighborhoods + Landmarks */}
        <section className="bg-cream py-20 md:py-28">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 md:px-10 lg:grid-cols-2">
            <div>
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">Neighborhoods We Serve</p>
              <div className="gold-rule mt-4" />
              <h2 className="mt-6 font-serif text-3xl font-medium leading-tight tracking-tight text-navy">Every corner of {city.name}.</h2>
              <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {city.neighborhoods.map((n) => (
                  <li key={n} className="flex items-center gap-2 text-base text-navy/75">
                    <Check className="h-4 w-4 shrink-0 text-gold-hover" strokeWidth={2} /> {n}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="inline-flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">
                <Landmark className="h-4 w-4" strokeWidth={1.5} /> Around the Area
              </p>
              <div className="gold-rule mt-4" />
              <h2 className="mt-6 font-serif text-3xl font-medium leading-tight tracking-tight text-navy">Local landmarks.</h2>
              <ul className="mt-6 flex flex-wrap gap-2.5">
                {city.landmarks.map((l) => (
                  <li key={l} className="rounded-full border border-navy/15 bg-cream-100 px-4 py-2 text-sm text-navy/70">{l}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Services available (links to service pages) */}
        <section className="bg-cream-100 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">Services in {city.name}</p>
            <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight text-navy md:text-4xl">Full-service moving, right here.</h2>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map((s) => (
                <Link key={s.slug} href={`/services/${s.slug}`} data-testid={`city-service-${s.slug}`} className="group flex items-center justify-between gap-4 rounded-sm border border-navy/10 bg-cream px-5 py-4 transition-colors hover:border-gold">
                  <span className="font-serif text-lg font-medium text-navy">{s.name}</span>
                  <ArrowRight className="h-4 w-4 text-gold-hover transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* City-specific FAQ */}
        <section className="bg-cream py-20 md:py-28" aria-labelledby="city-faq-title">
          <div className="mx-auto max-w-3xl px-6 md:px-10">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">Questions & Answers</p>
            <h2 id="city-faq-title" className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight text-navy md:text-4xl">Moving in {city.name}.</h2>
            <dl className="mt-10 divide-y divide-navy/10">
              {city.faqs.map((f) => (
                <div key={f.q} className="py-5">
                  <dt className="font-serif text-lg font-medium text-navy">{f.q}</dt>
                  <dd className="mt-2 text-base leading-relaxed text-navy/70">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Nearby cities (internal linking) */}
        <section className="bg-cream-100 py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-serif text-2xl font-medium text-navy md:text-3xl">Nearby areas we serve</h2>
              <Link href="/service-areas" className="group inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold-hover">
                All service areas <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {nearby.map((n) => (
                <Link key={n!.slug} href={`/service-areas/${n!.slug}`} data-testid={`nearby-${n!.slug}`} className="group flex items-center justify-between gap-4 rounded-sm border border-navy/10 bg-cream px-5 py-4 transition-colors hover:border-gold">
                  <span className="inline-flex items-center gap-2 font-serif text-lg font-medium text-navy">
                    <MapPin className="h-4 w-4 text-gold-hover" strokeWidth={1.5} /> {n!.name}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gold-hover transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <EstimateSection />
      </main>

      <SiteFooter />
    </div>
  );
}
