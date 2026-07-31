import Image from "next/image";
import { ArrowRight, Phone } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function Hero() {
  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative flex min-h-[92vh] items-center overflow-hidden bg-navy pt-20"
    >
      {/* Signature New Orleans artwork — the cinematic backdrop. */}
      <div className="absolute inset-0">
        <Image
          src="/brand/login-art.jpg"
          alt="Illustrated New Orleans skyline at night with a golden crescent moon, St. Louis Cathedral, and the Crescent City Connection bridge"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_center] md:object-[75%_center]"
        />
      </div>

      {/* Real moving crew, blended in on the left behind the copy. */}
      <div className="absolute inset-y-0 left-0 hidden w-[58%] md:block">
        <Image
          src="/brand/photos/hero-crew.jpg"
          alt=""
          aria-hidden="true"
          fill
          sizes="58vw"
          className="object-cover object-center opacity-25 mix-blend-luminosity"
        />
      </div>

      {/* Navy gradients for depth + text legibility. */}
      <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/92 to-navy/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/25 to-navy/70" />
      <div className="grain absolute inset-0" />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24 md:px-10">
        <div className="max-w-4xl">
          <p className="animate-fade-in font-heading text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            Moving You Forward
          </p>
          <h1 className="mt-6 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-cream sm:text-6xl lg:text-7xl">
            Moving You Forward.
            <br />
            <span className="text-gold-light">Cleaning Out the Past.</span>
          </h1>
          <div className="gold-rule mt-8" />
          <p className="mt-8 max-w-xl text-lg font-light leading-relaxed text-cream/80">
            Professional residential and commercial moving throughout New
            Orleans and Southeast Louisiana — handled with the care, pride, and
            craftsmanship your home deserves.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#estimate"
              data-testid="hero-estimate-btn"
              className="group inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-8 py-4 text-sm font-semibold uppercase tracking-wide text-navy transition-colors duration-300 hover:bg-gold-hover"
            >
              Get Free Estimate
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href={BRAND.phoneHref}
              data-testid="hero-call-btn"
              className="inline-flex items-center justify-center gap-2 rounded-sm border border-cream/40 px-8 py-4 text-sm font-semibold uppercase tracking-wide text-cream transition-colors duration-300 hover:border-cream hover:bg-cream hover:text-navy"
            >
              <Phone className="h-4 w-4" />
              Call {BRAND.phone}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
