// Defensive display accessors — the live mvp-dashboard payload nests customer
// info under a `customers` (plural) object and uses varying field names.

import type { Job, Quote } from "./types";

type AnyObj = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

// The joined customer record may be under `customers` (Supabase FK naming) or `customer`.
function customerObj(o: AnyObj): AnyObj | undefined {
  const c = (o.customers ?? o.customer) as unknown;
  if (Array.isArray(c)) return (c[0] as AnyObj) ?? undefined;
  if (c && typeof c === "object") return c as AnyObj;
  return undefined;
}

function nameFrom(c: AnyObj): string | undefined {
  return (
    str(c.name) ||
    [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ") ||
    str(c.email)
  );
}

export function customerDisplayName(c: AnyObj): string {
  return nameFrom(c) || "Customer";
}

function displayName(o: AnyObj, fallback: string): string {
  const c = customerObj(o);
  return (
    str(o.customer_name) ||
    str(o.name) ||
    [str(o.first_name), str(o.last_name)].filter(Boolean).join(" ") ||
    (c ? nameFrom(c) : undefined) ||
    str(o.email) ||
    fallback
  );
}

export function leadName(lead: AnyObj): string {
  return displayName(lead as AnyObj, "Unnamed lead");
}
export function quoteCustomer(quote: Quote): string {
  return displayName(quote as AnyObj, "Customer");
}
export function jobCustomer(job: Job): string {
  return displayName(job as AnyObj, "Customer");
}

export function contactEmail(o: AnyObj): string | undefined {
  return str(o.email) || str(customerObj(o)?.email);
}
export function contactPhone(o: AnyObj): string | undefined {
  return str(o.phone) || str(customerObj(o)?.phone);
}

export function leadVolume(lead: AnyObj): string {
  const o = lead as AnyObj;
  const v =
    o.estimated_volume_cuft ?? o.estimated_volume ?? o.estimated_cubic_feet;
  return v !== undefined && v !== null ? `${v} cu ft` : "—";
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
