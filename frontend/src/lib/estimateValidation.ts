import { z } from "zod";

// Client-side UX validation that MIRRORS the server (Edge Function + RPC) bounds.
// The server remains authoritative; this only gives fast, friendly feedback.
// The whitelists below match the deployed public-lead-intake Edge Function so
// every value the form can send is one the server will accept and store.
export const MOVE_TYPES = [
  "Residential Moving",
  "Commercial Moving",
  "Packing Services",
  "Specialty Items",
  "Local Moving",
  "Long-Distance",
] as const;

export const HOME_SIZES = [
  "Studio",
  "1 Bedroom",
  "2 Bedrooms",
  "3 Bedrooms",
  "4 Bedrooms",
  "5+ Bedrooms",
  "Office",
  "Storage Unit",
  "Other",
] as const;

export const SERVICES = [
  "Packing",
  "Unpacking",
  "Loading",
  "Unloading",
  "Furniture Assembly",
  "Storage",
  "Specialty Items",
  "Junk Removal",
] as const;

export type EstimateFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  moveType: string;
  moveDate: string;
  homeSize: string;
  originCity: string;
  originZip: string;
  destinationCity: string;
  destinationZip: string;
  services: string[];
  notes: string;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const estimateSchema = z
  .object({
    firstName: z.string().trim().min(1, "Please enter your first name.").max(80, "First name is too long."),
    lastName: z.string().trim().min(1, "Please enter your last name.").max(80, "Last name is too long."),
    email: z.string().trim().max(160, "Email is too long.").optional().or(z.literal("")),
    phone: z.string().trim().max(40, "Phone number is too long.").optional().or(z.literal("")),
    moveType: z.string().optional().or(z.literal("")),
    moveDate: z.string().optional().or(z.literal("")),
    homeSize: z.string().optional().or(z.literal("")),
    originCity: z.string().trim().max(80, "City name is too long.").optional().or(z.literal("")),
    originZip: z.string().trim().max(10, "ZIP is too long.").optional().or(z.literal("")),
    destinationCity: z.string().trim().max(80, "City name is too long.").optional().or(z.literal("")),
    destinationZip: z.string().trim().max(10, "ZIP is too long.").optional().or(z.literal("")),
    services: z.array(z.string()).optional().default([]),
    notes: z.string().trim().max(2000, "Please shorten your notes (2000 characters max).").optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    const email = (v.email ?? "").trim();
    const phone = (v.phone ?? "").trim();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Please enter a valid email address." });
    }
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (!/^[+0-9 ().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Please enter a valid phone number." });
      }
    }
    if (!email && !phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contact"], message: "Add a phone number or email so we can reach you." });
    }

    if (v.moveType && !(MOVE_TYPES as readonly string[]).includes(v.moveType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moveType"], message: "Please choose a valid move type." });
    }

    if (v.homeSize && !(HOME_SIZES as readonly string[]).includes(v.homeSize)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["homeSize"], message: "Please choose a valid home size." });
    }

    const oz = (v.originZip ?? "").trim();
    if (oz && !/^[0-9][0-9-]{0,9}$/.test(oz)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["originZip"], message: "Enter a valid ZIP (numbers only)." });
    }
    const dz = (v.destinationZip ?? "").trim();
    if (dz && !/^[0-9][0-9-]{0,9}$/.test(dz)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationZip"], message: "Enter a valid ZIP (numbers only)." });
    }

    if (v.services && v.services.some((s) => !(SERVICES as readonly string[]).includes(s))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["services"], message: "Please choose valid services." });
    }

    const md = (v.moveDate ?? "").trim();
    if (md) {
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(md)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moveDate"], message: "Please choose a valid date." });
      } else {
        const d = new Date(md + "T00:00:00");
        const max = startOfToday();
        max.setFullYear(max.getFullYear() + 2);
        if (isNaN(d.getTime()) || d < startOfToday() || d > max) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moveDate"], message: "Please choose a date within the next two years." });
        }
      }
    }
  });

export function validateEstimate(values: EstimateFormValues): {
  ok: boolean;
  errors: Record<string, string>;
} {
  const res = estimateSchema.safeParse(values);
  if (res.success) return { ok: true, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
