import type { NormalizedDashboard } from "./types";

// The mvp-dashboard Edge Function shape is confirmed at runtime. This
// normalizer defensively maps a range of likely key spellings into the
// typed structure the UI consumes, so the app stays resilient to shape drift.

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj {
  return v && typeof v === "object" ? (v as AnyObj) : {};
}

function asArray(v: unknown): AnyObj[] {
  if (Array.isArray(v)) return v as AnyObj[];
  return [];
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return fallback;
}

// Pick the first defined value across candidate keys.
function pick(obj: AnyObj, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function countOf(source: AnyObj, arr: AnyObj[], keys: string[]): number {
  const v = pick(source, keys);
  if (typeof v === "number") return v;
  if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  return arr.length;
}

export function normalizeDashboard(raw: unknown): NormalizedDashboard {
  const root = asObj(raw);
  // Data may live at root or under a `data` / `dashboard` envelope.
  const d = { ...asObj(root.data), ...asObj(root.dashboard), ...root };

  const counts = asObj(pick(d, ["counts", "metrics", "stats", "summary"]));

  const recentLeads = asArray(
    pick(d, ["recent_leads", "recentLeads", "leads"])
  );
  const recentQuotes = asArray(
    pick(d, ["recent_quotes", "recentQuotes", "quotes"])
  );
  const upcomingJobs = asArray(
    pick(d, ["upcoming_jobs", "upcomingJobs", "jobs"])
  );
  const trucks = asArray(pick(d, ["trucks", "fleet"]));
  const customers = asArray(pick(d, ["customers", "recent_customers", "recentCustomers"]));
  const dispatchAssignments = asArray(
    pick(d, [
      "dispatch_assignments",
      "dispatchAssignments",
      "assignments",
      "dispatch",
    ])
  );
  const stepsRaw = asArray(
    pick(d, [
      "onboarding_steps",
      "onboardingSteps",
      "onboarding",
      "company_onboarding_steps",
    ])
  );

  const onboardingObj = asObj(pick(d, ["onboarding"]));
  const stepsFromObj = asArray(onboardingObj.steps);
  const steps = stepsRaw.length ? stepsRaw : stepsFromObj;

  const completed = steps.filter((s) => {
    const done = pick(s, ["completed", "is_complete", "done", "is_completed"]);
    if (typeof done === "boolean") return done;
    const st = String(pick(s, ["status"]) ?? "").toLowerCase();
    return st === "completed" || st === "complete" || st === "done";
  }).length;

  const company =
    asObj(pick(d, ["company"])) || null;

  return {
    company:
      company && Object.keys(company).length
        ? {
            name: (pick(company, ["name", "company_name"]) as string) ?? undefined,
            id: (pick(company, ["id"]) as string) ?? undefined,
          }
        : null,
    counts: {
      customers: countOf(counts, asArray(pick(d, ["customers"])), [
        "customers",
        "customer_count",
        "customers_count",
        "total_customers",
      ]),
      leads: countOf(counts, recentLeads, [
        "leads",
        "lead_count",
        "leads_count",
        "total_leads",
      ]),
      quotes: countOf(counts, recentQuotes, [
        "quotes",
        "quote_count",
        "quotes_count",
        "total_quotes",
      ]),
      jobs: countOf(counts, upcomingJobs, [
        "jobs",
        "job_count",
        "jobs_count",
        "total_jobs",
      ]),
      dispatchAssignments: countOf(counts, dispatchAssignments, [
        "dispatch_assignments",
        "dispatchAssignments",
        "assignments",
        "dispatch_count",
      ]),
      trucks: countOf(counts, trucks, [
        "trucks",
        "truck_count",
        "trucks_count",
        "total_trucks",
      ]),
    },
    onboarding: {
      completed: num(pick(onboardingObj, ["completed"]), completed),
      total: num(pick(onboardingObj, ["total"]), steps.length),
      steps,
    },
    recentLeads: recentLeads as NormalizedDashboard["recentLeads"],
    recentQuotes: recentQuotes as NormalizedDashboard["recentQuotes"],
    upcomingJobs: upcomingJobs as NormalizedDashboard["upcomingJobs"],
    trucks: trucks as NormalizedDashboard["trucks"],
    customers: customers as NormalizedDashboard["customers"],
    dispatchAssignments:
      dispatchAssignments as NormalizedDashboard["dispatchAssignments"],
    raw,
  };
}
