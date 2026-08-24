import { ArrowRight, Phone } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { ManagedMarketingImage } from "./ManagedMarketingImage";

export function Hero() {
  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative flex min-h-[92vh] items-center overflow-hidden bg-navy pt-20 lg:min-h-[94vh] lg:pt-24"
    >
      <div className="absolute inset-0">
        <ManagedMarketingImage
          slot="hero_background"
          defaultSrc="/brand/login-art-full.jpg"
          alt="Illustrated New Orleans skyline at night with a golden crescent moon, St. Louis Cathedral, and the Crescent City Connection bridge"
          className="h-full w-full object-cover object-center lg:scale-[1.02]"
        />
      </div>

      <div className="absolute inset-y-0 left-0 hidden w-[58%] md:block lg:w-[54%]">
        <ManagedMarketingImage
          slot="hero_crew"
          defaultSrc="/brand/photos/hero-crew.jpg"
          alt="Southern Magnolia Movers crew"
          className="h-full w-full object-cover object-center opacity-25 mix-blend-luminosity lg:opacity-30"
        />
      </div>

      <div className="absolute inset-0 bg-navy/55 lg:bg-navy/50" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/25 to-navy/70 lg:bg-[linear-gradient(90deg,rgba(14,42,74,0.97)_0%,rgba(14,42,74,0.80)_43%,rgba(14,42,74,0.36)_72%,rgba(14,42,74,0.56)_100%)]" />
      <div className="grain absolute inset-0" />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24 md:px-10 lg:max-w-[1440px] lg:px-12 lg:py-28 xl:px-16">
        <div className="max-w-4xl lg:max-w-[760px] xl:max-w-[820px]">
          <p className="animate-fade-in font-heading text-xs font-semibold uppercase tracking-[0.3em] text-gold lg:text-[13px] lg:tracking-[0.34em]">
            Moving You Forward
          </p>
          <h1 className="mt-6 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-cream sm:text-6xl lg:mt-7 lg:text-[4.8rem] lg:leading-[0.99] xl:text-[5.4rem]">
            Moving You Forward.
            <br />
            <span className="text-gold-light">Cleaning Out the Past.</span>
          </h1>
          <div className="gold-rule mt-8 lg:mt-9 lg:w-20" />
          <p className="mt-8 max-w-xl text-lg font-light leading-relaxed text-cream/80 lg:mt-9 lg:max-w-2xl lg:text-xl lg:leading-8 lg:text-cream/82">
            Professional residential and commercial moving throughout New
            Orleans and Southeast Louisiana — handled with the care, pride, and
            craftsmanship your home deserves.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-11 lg:gap-4">
            <a
              href="#estimate"
              data-testid="hero-estimate-btn"
              className="group inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-8 py-4 text-sm font-semibold uppercase tracking-wide text-navy transition-colors duration-300 hover:bg-gold-hover lg:rounded-full lg:px-9 lg:py-[17px] lg:shadow-[0_12px_30px_rgb(200,154,61,0.20)] lg:transition-[background-color,transform,box-shadow] lg:hover:-translate-y-0.5 lg:hover:shadow-[0_18px_36px_rgb(200,154,61,0.28)]"
            >
              Get Free Estimate
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href={BRAND.phoneHref}
              data-testid="hero-call-btn"
              className="inline-flex items-center justify-center gap-2 rounded-sm border border-cream/40 px-8 py-4 text-sm font-semibold uppercase tracking-wide text-cream transition-colors duration-300 hover:border-cream hover:bg-cream hover:text-navy lg:rounded-full lg:border-cream/30 lg:px-9 lg:py-[17px] lg:backdrop-blur-sm lg:transition-[background-color,border-color,color,transform] lg:hover:-translate-y-0.5"
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
