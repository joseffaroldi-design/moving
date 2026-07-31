import { MapPin, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";
import { EstimateForm } from "./EstimateForm";

const AREAS = [
  "New Orleans",
  "Metairie",
  "Kenner",
  "Covington",
  "Mandeville",
  "Slidell",
  "Hammond",
  "Gretna",
  "Laplace",
  "Houma",
];

export function EstimateSection() {
  return (
    <section
      id="estimate"
      className="anchor relative overflow-hidden bg-navy py-20 md:py-28 lg:py-32"
      data-testid="estimate-section"
    >
      <div className="grain absolute inset-0" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-14 px-6 md:px-10 lg:grid-cols-2 lg:gap-20">
        {/* Service area */}
        <div id="service-area" className="anchor">
          <Reveal>
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Proudly Serving
            </p>
            <div className="gold-rule mt-4" />
            <h2 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-tight text-cream md:text-5xl">
              New Orleans &amp; Southeast Louisiana.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-cream/70">
              Deep roots across the region — and the local knowledge to move you
              anywhere in it. Not sure if you&apos;re in range? Just ask.
            </p>

            <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-3">
              {AREAS.map((area) => (
                <li
                  key={area}
                  className="flex items-center gap-2 text-sm text-cream/80"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-gold" strokeWidth={1.5} />
                  {area}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm italic text-cream/50">
              …and all surrounding communities.
            </p>
          </Reveal>
        </div>

        {/* Estimate form */}
        <Reveal delay={120}>
          <div className="border border-cream/10 bg-cream-100 p-6 shadow-[0_20px_60px_rgb(0,0,0,0.25)] sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/50 bg-navy">
                <ShieldCheck className="h-5 w-5 text-gold" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold-hover">
                  Get Your Free Estimate
                </p>
                <h3 className="font-serif text-xl font-medium text-navy">
                  Start your move today
                </h3>
              </div>
            </div>
            <div className="mt-6">
              <EstimateForm />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
