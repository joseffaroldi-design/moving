import Link from "next/link";
import {
  Truck,
  ArrowRight,
  Users,
  FileText,
  CalendarClock,
  Smartphone,
} from "lucide-react";

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
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
            <Truck className="h-5 w-5" />
          </div>
          <span className="font-heading text-lg font-bold">MoveOps</span>
        </div>
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
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-hover"
          >
            View demo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20 sm:py-28">
          <p className="mb-4 inline-flex rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-300">
            Moving company operations
          </p>
          <h1 className="max-w-3xl font-heading text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            Run every move from lead to paid — in one place.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            MoveOps connects sales, dispatch, and crews so your team can quote
            faster, dispatch smarter, and get paid sooner.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-semibold hover:bg-accent-hover"
            >
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-slate-500"
            >
              Sign in to your account
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-md border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-accent/15">
                <f.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-heading text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
