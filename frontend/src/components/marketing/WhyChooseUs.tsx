import Image from "next/image";
import { ArrowRight, ShieldCheck, Truck, Compass } from "lucide-react";
import { Reveal } from "./Reveal";

const CARDS = [
  {
    icon: ShieldCheck,
    title: "Careful Crew",
    desc: "Trained, uniformed, and committed to treating your belongings with respect.",
    image: "/brand/photos/why-crew.jpg",
  },
  {
    icon: Truck,
    title: "Right Equipment",
    desc: "Clean trucks, quality tools, and the right resources for a smooth move.",
    image: "/brand/photos/why-truck.jpg",
  },
  {
    icon: Compass,
    title: "Local Knowledge",
    desc: "We know New Orleans and Southeast Louisiana like the back of our hand.",
    image: "/brand/photos/why-nola.jpg",
  },
];

export function WhyChooseUs() {
  return (
    <section
      id="why-us"
      className="anchor bg-cream-100 py-20 md:py-28 lg:py-36"
      data-testid="why-us-section"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-10 lg:max-w-[1440px] lg:px-12 xl:px-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-20">
          <Reveal className="lg:col-span-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover lg:tracking-[0.3em]">
              Why Choose Us
            </p>
            <div className="gold-rule mt-4 lg:w-16" />
            <h2 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-tight text-navy md:text-5xl lg:text-[3.4rem] lg:leading-[1.06]">
              New Orleans Roots. Professional Standards.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-navy/70 lg:max-w-md lg:text-[17px] lg:leading-8">
              We&apos;re more than a moving company — we&apos;re your neighbors.
              From the first box to the last, we treat your move like our own.
              No shortcuts. No surprises. Just honest work and exceptional care.
            </p>
            <a
              href="#estimate"
              data-testid="why-learn-more-btn"
              className="group mt-8 inline-flex items-center gap-2 rounded-sm bg-navy px-7 py-3.5 text-sm font-semibold uppercase tracking-wide text-cream transition-colors duration-300 hover:bg-navy-900 lg:mt-9 lg:rounded-full lg:px-8 lg:py-4 lg:shadow-[0_10px_26px_rgb(14,42,74,0.14)] lg:transition-[background-color,transform,box-shadow] lg:hover:-translate-y-0.5 lg:hover:shadow-[0_14px_32px_rgb(14,42,74,0.20)]"
            >
              Learn More About Us
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </Reveal>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:col-span-8 lg:gap-7">
            {CARDS.map((card, i) => (
              <Reveal key={card.title} delay={i * 110}>
                <article className="group flex h-full flex-col overflow-hidden border border-navy/10 bg-cream shadow-[0_8px_30px_rgb(14,42,74,0.05)] lift lg:rounded-[2px] lg:border-navy/[0.08] lg:shadow-[0_14px_44px_rgb(14,42,74,0.07)] lg:hover:shadow-[0_22px_54px_rgb(14,42,74,0.13)]">
                  <div className="relative aspect-[4/3] overflow-hidden lg:aspect-[4/3.15]">
                    <Image
                      src={card.image}
                      alt={card.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover img-zoom"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent lg:from-navy/48" />
                    <div className="absolute -bottom-5 left-5 flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-navy shadow-lg lg:left-6 lg:h-12 lg:w-12">
                      <card.icon className="h-5 w-5 text-gold" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-5 pb-6 pt-8 lg:px-6 lg:pb-7 lg:pt-9">
                    <h3 className="font-serif text-xl font-medium text-navy lg:text-[1.35rem]">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy/65 lg:mt-3 lg:leading-6">
                      {card.desc}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
