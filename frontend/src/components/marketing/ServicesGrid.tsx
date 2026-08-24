import Link from "next/link";
import { Home, Building2, Package, Gem, MapPin, Route, ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";
import { ManagedMarketingImage } from "./ManagedMarketingImage";
import type { WebsiteMediaSlot } from "@/lib/websiteMedia";

const SERVICES: Array<{
  icon: typeof Home;
  title: string;
  desc: string;
  image: string;
  slot: WebsiteMediaSlot;
  slug: string;
}> = [
  { icon: Home, title: "Residential Moving", desc: "From apartments to estates, we move you home.", image: "/brand/photos/svc-residential.jpg", slot: "service_residential", slug: "residential-moving" },
  { icon: Building2, title: "Commercial Moving", desc: "Minimize downtime. We keep your business moving.", image: "/brand/photos/svc-commercial.jpg", slot: "service_commercial", slug: "commercial-moving" },
  { icon: Package, title: "Packing Services", desc: "Full or partial packing done professionally.", image: "/brand/photos/svc-packing.jpg", slot: "service_packing", slug: "packing-services" },
  { icon: Gem, title: "Specialty Moving", desc: "Pianos, antiques, artwork, and fragile pieces.", image: "/brand/photos/svc-specialty.jpg", slot: "service_specialty", slug: "specialty-moving" },
  { icon: MapPin, title: "Local Moving", desc: "Local moves across town, done with care.", image: "/brand/photos/svc-local.jpg", slot: "service_local", slug: "local-moving" },
  { icon: Route, title: "Long-Distance Moving", desc: "Across Louisiana and beyond, mile after mile.", image: "/brand/photos/svc-longdistance.jpg", slot: "service_long_distance", slug: "long-distance-moving" },
];

export function ServicesGrid() {
  return (
    <section id="services" className="anchor relative overflow-hidden bg-navy py-20 md:py-28 lg:py-36" data-testid="services-section">
      <div className="grain absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-6 md:px-10 lg:max-w-[1440px] lg:px-12 xl:px-16">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end lg:gap-12">
          <Reveal>
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold lg:tracking-[0.3em]">Our Services</p>
            <div className="gold-rule mt-4 lg:w-16" />
            <h2 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-tight text-cream md:text-5xl lg:text-[3.5rem]">We Handle It All.</h2>
          </Reveal>
          <Reveal delay={120}>
            <a href="#estimate" data-testid="services-view-all" className="group inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold transition-colors hover:text-gold-light lg:pb-1">
              Request Your Move
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </Reveal>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-7">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 110}>
              <Link href={`/services/${s.slug}`} data-testid={`service-card-${s.slug}`} aria-label={`${s.title} — learn more`} className="group flex h-full flex-col overflow-hidden border border-cream/10 bg-navy-800/40 lift lg:border-cream/[0.09] lg:bg-navy-800/45 lg:shadow-[0_18px_52px_rgb(0,0,0,0.14)] lg:hover:shadow-[0_26px_64px_rgb(0,0,0,0.24)]">
                <div className="relative aspect-[16/10] overflow-hidden lg:aspect-[16/9.6]">
                  <ManagedMarketingImage slot={s.slot} defaultSrc={s.image} alt={`${s.title} in New Orleans — Southern Magnolia Movers`} className="h-full w-full object-cover img-zoom" />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/30 to-transparent lg:from-navy lg:via-navy/22" />
                  <div className="absolute -bottom-5 left-5 flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-navy-900 shadow-lg lg:left-6 lg:h-12 lg:w-12 lg:border-gold/60">
                    <s.icon className="h-5 w-5 text-gold" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col px-6 pb-6 pt-8 lg:px-7 lg:pb-7 lg:pt-9">
                  <h3 className="font-serif text-xl font-medium text-cream lg:text-[1.4rem]">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-cream/60 lg:mt-3 lg:text-[15px] lg:leading-6 lg:text-cream/65">{s.desc}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold transition-colors group-hover:text-gold-light lg:mt-5">
                    Learn more
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
