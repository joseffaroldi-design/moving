// Central status classification for badges across MoveOps entities.

export type BadgeTone = "neutral" | "info" | "success" | "danger" | "warning";

const SUCCESS = ["won", "approved", "accepted", "completed", "paid", "active", "confirmed", "signed", "clocked_in"];
const INFO = ["in_progress", "contacted", "qualified", "sent", "scheduled", "assigned", "dispatched", "quoted", "reviewed", "en_route", "partial", "partially_paid"];
const DANGER = ["lost", "expired", "overdue", "cancelled", "canceled", "rejected", "failed", "declined", "void"];
const WARNING = ["pending", "draft", "unassigned", "on_hold", "hold", "unpaid", "awaiting"];

export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  const s = status.toLowerCase().trim().replace(/\s+/g, "_");
  if (SUCCESS.includes(s)) return "success";
  if (DANGER.includes(s)) return "danger";
  if (WARNING.includes(s)) return "warning";
  if (INFO.includes(s)) return "info";
  return "neutral";
}

export const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-300",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
};
