import Image from "next/image";
import { Phone, ClipboardList, Package, ShieldCheck, Check } from "lucide-react";
import { Reveal } from "./Reveal";

const STEPS = [
  {
    icon: Phone,
    title: "Request Estimate",
    desc: "Tell us about your move online or give us a call.",
  },
  {
    icon: ClipboardList,
    title: "Plan Your Move",
    desc: "We'll confirm the details and create your plan.",
  },
  {
    icon: Package,
    title: "We Get to Work",
    desc: "Our crew arrives on time and gets the job done.",
  },
  {
    icon: ShieldCheck,
    title: "Safe Delivery",
    desc: "We deliver and place everything with care.",
  },
  {
    icon: Check,
    title: "You're Settled",
    desc: "We're not done until you're happy.",
  },
];

export function ProcessTimeline() {
  return (
    <section
      id="process"
      className="anchor bg-cream py-20 md:py-28 lg:py-32"
      data-testid="process-section"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">
              Our Process
            </p>
            <div className="gold-rule mt-4" />
            <h2 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-tight text-navy md:text-5xl">
              A Better Moving Experience.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-navy/70">
              Five simple steps, one calm move. From the first call to the last
              box, you always know exactly what happens next.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="relative aspect-[4/3] overflow-hidden border border-navy/10 shadow-[0_20px_60px_rgb(14,42,74,0.15)]">
              <Image
                src="/brand/photos/process-crew.jpg"
                alt="Southern Magnolia movers carefully carrying furniture through a bright home"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>

        {/* Timeline */}
        <div className="relative mt-16 md:mt-20">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent md:block" />
          <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-5 md:gap-6">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 100}>
                <li className="relative flex flex-col items-start md:items-center md:text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-navy shadow-[0_8px_24px_rgb(14,42,74,0.18)]">
                    <step.icon className="h-5 w-5 text-gold" strokeWidth={1.5} />
                  </div>
                  <span className="mt-4 font-heading text-xs font-semibold uppercase tracking-[0.2em] text-gold-hover">
                    Step {i + 1}
                  </span>
                  <h3 className="mt-1 font-serif text-lg font-medium text-navy">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy/60 md:max-w-[15rem]">
                    {step.desc}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
