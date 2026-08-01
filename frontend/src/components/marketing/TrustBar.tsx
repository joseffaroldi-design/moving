import { ShieldCheck, Users, Building2, MapPin } from "lucide-react";
import { Reveal } from "./Reveal";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Careful, Professional Service",
    desc: "Your belongings are in good hands.",
  },
  {
    icon: Users,
    title: "Family Owned",
    desc: "Local roots. Personal service.",
  },
  {
    icon: Building2,
    title: "Residential & Commercial",
    desc: "Moves of any size, done right.",
  },
  {
    icon: MapPin,
    title: "Local & Long Distance",
    desc: "Across town or across the country.",
  },
];

export function TrustBar() {
  return (
    <section
      data-testid="trust-bar"
      className="border-y border-cream/10 bg-navy-900"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((item, i) => (
          <Reveal key={item.title} delay={i * 90}>
            <div className="flex items-start gap-4 px-6 py-8 md:px-8 md:py-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40">
                <item.icon className="h-5 w-5 text-gold" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-heading text-sm font-semibold uppercase tracking-wide text-cream">
                  {item.title}
                </p>
                <p className="mt-1 text-sm text-cream/60">{item.desc}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
