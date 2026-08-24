import Image from "next/image";
import { Phone, ClipboardList, Package, ShieldCheck, Check } from "lucide-react";
import { Reveal } from "./Reveal";

const STEPS = [
  { icon: Phone, title: "Request Estimate", desc: "Tell us about your move online or give us a call." },
  { icon: ClipboardList, title: "Plan Your Move", desc: "We'll confirm the details and create your plan." },
  { icon: Package, title: "We Get to Work", desc: "Our crew arrives on time and gets the job done." },
  { icon: ShieldCheck, title: "Safe Delivery", desc: "We deliver and place everything with care." },
  { icon: Check, title: "You're Settled", desc: "We're not done until you're happy." },
];

export function ProcessTimeline() {
  return (
    <section id="process" className="anchor bg-cream py-20 md:py-28 lg:py-36" data-testid="process-section">
      <div className="mx-auto max-w-7xl px-6 md:px-10 lg:max-w-[1440px] lg:px-12 xl:px-16">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:col-span-5">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover lg:tracking-[0.3em]">Our Process</p>
            <div className="gold-rule mt-4 lg:w-16" />
            <h2 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-tight text-navy md:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">A Better Moving Experience.</h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-navy/70 lg:mt-7 lg:max-w-lg lg:text-[17px] lg:leading-8">
              Five simple steps, one calm move. From the first call to the last box, you always know exactly what happens next.
            </p>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-7">
            <div className="relative aspect-[4/3] overflow-hidden border border-navy/10 shadow-[0_20px_60px_rgb(14,42,74,0.15)] lg:aspect-[16/10] lg:border-navy/[0.08] lg:shadow-[0_28px_76px_rgb(14,42,74,0.17)]">
              <Image src="/brand/photos/process-crew.jpg" alt="Southern Magnolia movers carefully carrying furniture through a bright home" fill sizes="(max-width: 1024px) 100vw, 58vw" className="object-cover" />
              <div className="absolute inset-0 hidden bg-gradient-to-tr from-navy/18 via-transparent to-transparent lg:block" />
            </div>
          </Reveal>
        </div>

        <div className="relative mt-16 md:mt-20 lg:mt-24">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent md:block lg:top-7" />
          <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-5 md:gap-6 lg:gap-8">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 100}>
                <li className="relative flex flex-col items-start md:items-center md:text-center lg:px-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-navy shadow-[0_8px_24px_rgb(14,42,74,0.18)] lg:h-14 lg:w-14 lg:shadow-[0_10px_28px_rgb(14,42,74,0.20)]">
                    <step.icon className="h-5 w-5 text-gold lg:h-[22px] lg:w-[22px]" strokeWidth={1.5} />
                  </div>
                  <span className="mt-4 font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold-hover lg:mt-5">Step {i + 1}</span>
                  <h3 className="mt-1 font-serif text-lg font-medium text-navy lg:mt-1.5 lg:text-xl">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy/60 md:max-w-[15rem] lg:mt-2 lg:leading-6">{step.desc}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
