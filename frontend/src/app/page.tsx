import Link from "next/link";
import {
  ArrowRight,
  Users,
  FileText,
  CalendarClock,
  Smartphone,
  Phone,
  Mail,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { CrescentMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

const features = [
  { icon: Users, title: "Leads & CRM", desc: "Capture, qualify, and track every lead to close." },
  { icon: FileText, title: "Quotes", desc: "Build itemized quotes and convert them to jobs." },
  { icon: CalendarClock, title: "Dispatch", desc: "Assign trucks and crews on a clear day-board." },
  { icon: Smartphone, title: "Crew Mobile", desc: "Clock in, capture photos, and update job status." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo variant="light" />
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            data-testid="landing-login-link"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            data-testid="landing-demo-link"
            className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-hover"
          >
            Open console <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20 sm:py-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-navy-900 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold">
            <CrescentMark className="h-4 w-4" /> New Orleans · Moving Operations
          </p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            {BRAND.taglinePrimary}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            The internal operating system for {BRAND.name} — leads, quotes, jobs,
            dispatch, and crews in one place. {BRAND.taglineSecondary}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-gold px-5 py-3 text-sm font-semibold text-navy hover:bg-gold-hover"
            >
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-gold"
            >
              Staff sign in
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-5 text-sm text-slate-300">
            <a href={BRAND.phoneHref} className="inline-flex items-center gap-2 hover:text-gold">
              <Phone className="h-4 w-4 text-gold" /> {BRAND.phone}
            </a>
            <a href={BRAND.emailHref} className="inline-flex items-center gap-2 hover:text-gold">
              <Mail className="h-4 w-4 text-gold" /> {BRAND.email}
            </a>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-md border border-navy-800 bg-navy-900 p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-gold/15">
                <f.icon className="h-5 w-5 text-gold" />
              </div>
              <h3 className="font-heading text-base font-semibold text-cream">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
