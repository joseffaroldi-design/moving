// Defensive display accessors — the live Supabase payload may nest customer
// info or use varying field names. These resolve a best-effort display value.

import type { Job, Lead, Quote } from "./types";

type AnyObj = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function nestedCustomerName(o: AnyObj): string | undefined {
  const c = o.customer as AnyObj | undefined;
  if (c && typeof c === "object") {
    return (
      str(c.name) ||
      [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ") ||
      str(c.email)
    );
  }
  return undefined;
}

export function leadName(lead: Lead): string {
  const o = lead as AnyObj;
  return (
    str(o.customer_name) ||
    str(o.name) ||
    [str(o.first_name), str(o.last_name)].filter(Boolean).join(" ") ||
    nestedCustomerName(o) ||
    str(o.email) ||
    "Unnamed lead"
  );
}

export function quoteCustomer(quote: Quote): string {
  const o = quote as AnyObj;
  return (
    str(o.customer_name) || nestedCustomerName(o) || str(o.email) || "Customer"
  );
}

export function jobCustomer(job: Job): string {
  const o = job as AnyObj;
  return (
    str(o.customer_name) || nestedCustomerName(o) || str(o.email) || "Customer"
  );
}

export function customerDisplayName(c: AnyObj): string {
  return (
    str(c.name) ||
    [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ") ||
    str(c.email) ||
    "Customer"
  );
}

// Resolve an address string for origin/destination across naming variants.
export function addr(entity: AnyObj, which: "origin" | "destination"): string {
  const candidates =
    which === "origin"
      ? ["origin", "origin_address", "from_address", "pickup_address", "origin_city"]
      : [
          "destination",
          "destination_address",
          "to_address",
          "dropoff_address",
          "destination_city",
        ];
  for (const k of candidates) {
    const v = str(entity[k]);
    if (v) return v;
  }
  return "—";
}
