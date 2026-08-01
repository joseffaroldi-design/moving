import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Reveal } from "./Reveal";
import { ServiceAreaMap } from "./ServiceAreaMap";
import { FEATURED_CITIES } from "@/lib/cities";

export function AreasWeServe() {
  return (
    <section
      id="areas-we-serve"
      className="anchor relative overflow-hidden bg-navy py-20 md:py-28 lg:py-32"
      data-testid="areas-we-serve-section"
    >
      <div className="grain absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-6 md:px-10">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Areas We Serve
            </p>
            <div className="gold-rule mt-4" />
            <h2 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-tight text-cream md:text-5xl">
              Rooted in the Greater New Orleans Area.
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-cream/70">
              From the French Quarter to Kenner, we move families and businesses
              across Orleans and Jefferson Parishes — with local crews who know
              every neighborhood.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5" data-testid="home-city-cards">
              {FEATURED_CITIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/service-areas/${c.slug}`}
                  data-testid={`home-city-${c.slug}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-cream/15 bg-navy-800/40 px-4 py-2 text-sm text-cream/80 transition-colors hover:border-gold hover:text-gold"
                >
                  <MapPin className="h-3.5 w-3.5 text-gold" strokeWidth={1.5} />
                  {c.name}
                </Link>
              ))}
            </div>

            <Link
              href="/service-areas"
              data-testid="home-view-all-areas"
              className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold transition-colors hover:text-gold-light"
            >
              View All Service Areas
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Reveal>

          <Reveal delay={140}>
            <div className="rounded-sm border border-cream/10 bg-navy-900/50 p-4 md:p-6">
              <ServiceAreaMap />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
