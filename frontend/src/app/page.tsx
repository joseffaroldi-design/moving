import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Phone,
  Mail,
  Truck,
  Package,
  Boxes,
  Sparkles,
  Handshake,
  ShieldCheck,
  BadgeDollarSign,
  HeartHandshake,
  MapPin,
  Clock,
  Menu,
} from "lucide-react";
import { Logo, CrescentMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { EstimateForm } from "@/components/marketing/EstimateForm";
import { BRAND } from "@/lib/brand";

// ── Easily editable content ────────────────────────────────────────────────
const HERO_IMAGE =
  "https://images.pexels.com/photos/7464393/pexels-photo-7464393.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80";

const NAV = [
  { label: "Services", href: "#services" },
  { label: "Why us", href: "#why-us" },
  { label: "Service area", href: "#service-area" },
  { label: "Contact", href: "#contact" },
];

const SERVICES = [
  {
    icon: Truck,
    title: "Local moving",
    desc: "Homes and apartments across greater New Orleans, handled by a careful local crew.",
    image:
      "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=800&q=75",
  },
  {
    icon: MapPin,
    title: "Long-distance moving",
    desc: "Moving out of the area? We plan the route, load with care, and keep you posted.",
  },
  {
    icon: Package,
    title: "Packing & wrapping",
    desc: "Professional packing and furniture wrapping so nothing shifts or scratches.",
    image:
      "https://images.unsplash.com/photo-1776018276728-b94299c4693e?auto=format&fit=crop&w=800&q=75",
  },
  {
    icon: Boxes,
    title: "Loading & unloading",
    desc: "Renting your own truck or container? We supply the muscle and the technique.",
  },
  {
    icon: Sparkles,
    title: "Junk removal & clean-outs",
    desc: "Clearing an estate, garage, or rental? We haul away what you no longer need.",
    image:
      "https://images.unsplash.com/photo-1714647211902-bb711d643a17?auto=format&fit=crop&w=800&q=75",
  },
  {
    icon: Handshake,
    title: "Big or small, we haul it all",
    desc: "A single heavy item or a whole household — tell us what you've got.",
  },
];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Careful, trained crew",
    desc: "We treat your belongings like our own — padded, wrapped, and secured.",
  },
  {
    icon: BadgeDollarSign,
    title: "Straightforward pricing",
    desc: "Clear estimates and no surprises. Ask us anything before your move.",
  },
  {
    icon: HeartHandshake,
    title: "Locally rooted",
    desc: "A New Orleans crew that knows the neighborhoods, streets, and staircases.",
  },
];

// Keep this list easy to edit. We describe the region without claiming
// specific parish coverage that hasn't been confirmed.
const SERVICE_AREA_STATEMENT = "New Orleans and surrounding communities.";

export default function HomePage() {
  return (
    <div className="min-h-screen scroll-smooth bg-cream-100 font-sans text-navy">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-navy/10 bg-cream-100/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
          <Logo variant="dark" />
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-navy"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href={BRAND.phoneHref} className="hidden sm:block">
              <Button variant="outline" size="md" data-testid="header-call-btn">
                <Phone className="h-4 w-4" /> {BRAND.phone}
              </Button>
            </a>
            <a href="#estimate">
              <Button variant="gold" size="md" data-testid="header-estimate-btn">
                Free estimate
              </Button>
            </a>
            <a
              href="#services"
              className="rounded-md p-2 text-slate-600 md:hidden"
              aria-label="View services"
            >
              <Menu className="h-5 w-5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-24">
          <div className="animate-fade-in">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-navy-900 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold">
              <CrescentMark className="h-4 w-4" /> New Orleans movers
            </p>
            <h1 className="font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {BRAND.taglinePrimary}
            </h1>
            <p className="mt-5 max-w-md text-lg text-slate-300">
              {BRAND.taglineSecondary} From a single heavy piece to a whole
              household, {BRAND.short} moves it with care.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#estimate">
                <Button variant="gold" size="lg" data-testid="hero-estimate-btn">
                  Get a free estimate <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href={BRAND.phoneHref}>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-slate-500 bg-transparent text-white hover:bg-navy-800 hover:text-white"
                  data-testid="hero-call-btn"
                >
                  <Phone className="h-4 w-4" /> Call or text
                </Button>
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gold" /> Careful crew
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold" /> Call or text for availability
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold" /> {SERVICE_AREA_STATEMENT}
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg shadow-dropdown ring-1 ring-white/10">
              <Image
                src={HERO_IMAGE}
                alt="Professional movers carrying boxes to a moving truck"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -left-4 hidden rounded-md border border-gold/30 bg-cream-100 px-4 py-3 text-navy shadow-dropdown sm:block">
              <p className="font-heading text-sm font-semibold">Big or small</p>
              <p className="text-xs text-slate-600">we haul it all</p>
            </div>
          </div>
        </div>
      </section>

      {/* Estimate form */}
      <section id="estimate" className="scroll-mt-20 bg-navy-900 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 sm:px-6 lg:grid-cols-2 lg:gap-14">
          <div className="text-white">
            <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Get your free moving estimate
            </h2>
            <p className="mt-4 max-w-md text-slate-300">
              Tell us about your move and we&apos;ll put together a fair,
              upfront estimate. Prefer to talk it through? Call or text us any
              time.
            </p>
            <a href={BRAND.phoneHref} className="mt-6 inline-block">
              <Button variant="gold" size="lg" data-testid="estimate-side-call-btn">
                <Phone className="h-4 w-4" /> {BRAND.phone}
              </Button>
            </a>
            <ul className="mt-8 space-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold" /> No obligation, no pressure
              </li>
              <li className="flex items-center gap-2">
                <BadgeDollarSign className="h-4 w-4 shrink-0 text-gold" /> Clear pricing before we start
              </li>
              <li className="flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 shrink-0 text-gold" /> Friendly local crew
              </li>
            </ul>
          </div>

          <div className="overflow-hidden rounded-lg bg-white shadow-dropdown">
            <EstimateForm />
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="scroll-mt-20 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="max-w-2xl">
            <p className="font-heading text-sm font-semibold uppercase tracking-wider text-gold-hover">
              What we do
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Moving services for every kind of haul
            </h2>
            <p className="mt-3 text-slate-600">
              Whether you&apos;re moving across town or clearing out a space,
              our crew shows up ready to work.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div
                key={s.title}
                className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-dropdown"
              >
                {s.image && (
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={s.image}
                      alt={s.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-gold/15">
                    <s.icon className="h-5 w-5 text-gold-hover" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-navy">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us / trust */}
      <section id="why-us" className="scroll-mt-20 bg-navy py-16 text-white sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="max-w-2xl">
            <p className="font-heading text-sm font-semibold uppercase tracking-wider text-gold">
              Why Southern Magnolia
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Moving you forward, with care
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {TRUST.map((t) => (
              <div
                key={t.title}
                className="rounded-lg border border-white/10 bg-navy-900 p-6"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gold/15">
                  <t.icon className="h-6 w-6 text-gold" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-cream">
                  {t.title}
                </h3>
                <p className="mt-2 text-sm text-slate-300">{t.desc}</p>
              </div>
            ))}
          </div>
          {/* Reviews section can be added here later. */}
        </div>
      </section>

      {/* Service area */}
      <section
        id="service-area"
        className="scroll-mt-20 py-16 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-card sm:p-12">
            <div className="flex items-center gap-3 text-gold-hover">
              <MapPin className="h-6 w-6" />
              <p className="font-heading text-sm font-semibold uppercase tracking-wider">
                Service area
              </p>
            </div>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Proudly serving {SERVICE_AREA_STATEMENT}
            </h2>
            <p className="mt-4 max-w-2xl text-slate-600">
              Not sure if you&apos;re in our range? Reach out — we&apos;re happy
              to let you know what we can do for your move.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-md bg-cream px-4 py-2 text-sm font-medium text-navy">
              <Clock className="h-4 w-4 text-gold-hover" /> Call or text for
              availability
            </p>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section id="contact" className="scroll-mt-20 bg-gold py-16 text-navy sm:py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to move? Let&apos;s talk.
            </h2>
            <p className="mt-3 max-w-md text-navy/80">
              Call or text for a fast, friendly estimate and current
              availability.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href={BRAND.phoneHref}>
              <Button
                variant="navy"
                size="lg"
                className="w-full sm:w-auto"
                data-testid="contact-call-btn"
              >
                <Phone className="h-4 w-4" /> {BRAND.phone}
              </Button>
            </a>
            <a href={BRAND.emailHref}>
              <Button
                variant="outline"
                size="lg"
                className="w-full border-navy/30 bg-transparent text-navy hover:bg-navy hover:text-white sm:w-auto"
                data-testid="contact-email-btn"
              >
                <Mail className="h-4 w-4" /> Email us
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy-900 py-12 text-slate-300">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <Logo variant="light" />
              <p className="mt-4 text-sm text-slate-400">
                {BRAND.taglinePrimary} {BRAND.taglineSecondary}
              </p>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <p className="font-heading font-semibold text-cream">Get in touch</p>
              <a
                href={BRAND.phoneHref}
                className="inline-flex items-center gap-2 hover:text-gold"
                data-testid="footer-phone-link"
              >
                <Phone className="h-4 w-4 text-gold" /> {BRAND.phone}
              </a>
              <a
                href={BRAND.emailHref}
                className="inline-flex items-center gap-2 hover:text-gold"
                data-testid="footer-email-link"
              >
                <Mail className="h-4 w-4 text-gold" /> {BRAND.email}
              </a>
              <span className="inline-flex items-center gap-2 text-slate-400">
                <MapPin className="h-4 w-4 text-gold" /> {SERVICE_AREA_STATEMENT}
              </span>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
            <p>
              © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
            </p>
            <Link
              href="/login"
              data-testid="staff-login-link"
              className="text-slate-500 transition-colors hover:text-gold"
            >
              Staff login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
