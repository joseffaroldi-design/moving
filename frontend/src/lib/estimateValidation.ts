import { z } from "zod";

// Client-side UX validation that MIRRORS the server (Edge Function + RPC) bounds.
// The server remains authoritative; this only gives fast, friendly feedback.
export const MOVE_TYPES = [
  "Residential Moving",
  "Commercial Moving",
  "Packing Services",
  "Specialty Items",
  "Local Moving",
  "Long-Distance",
] as const;

export type EstimateFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  moveType: string;
  moveDate: string;
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
