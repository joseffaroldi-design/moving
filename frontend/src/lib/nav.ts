import {
  LayoutDashboard,
  Users,
  UserRound,
  FileText,
  Truck,
  CalendarClock,
  Receipt,
  BarChart3,
  Settings,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
}

export const STAFF_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/dashboard/leads", icon: Users },
  { label: "Customers", href: "/dashboard/customers", icon: UserRound },
  { label: "Quotes", href: "/dashboard/quotes", icon: FileText },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Dispatch", href: "/dashboard/dispatch", icon: CalendarClock },
  { label: "Invoices", href: "/dashboard/invoices", icon: Receipt },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const PORTAL_NAV: NavItem[] = [
  { label: "Overview", href: "/portal", icon: LayoutDashboard },
  { label: "Quotes", href: "/portal/quotes", icon: FileText },
  { label: "Payments", href: "/portal/payments", icon: Receipt },
  { label: "Documents", href: "/portal/documents", icon: FileText },
];

export const MOBILE_NAV: NavItem[] = [
  { label: "Jobs", href: "/mobile/jobs", icon: Briefcase },
  { label: "Clock", href: "/mobile/clock", icon: CalendarClock },
  { label: "Photos", href: "/mobile/photos", icon: Truck },
  { label: "Checklists", href: "/mobile/checklists", icon: FileText },
];

export const ROLE_HOME: Record<string, string> = {
  owner: "/dashboard",
  operations_manager: "/dashboard",
  dispatcher: "/dashboard/dispatch",
  sales: "/dashboard/leads",
  crew_lead: "/mobile/jobs",
  mover: "/mobile/jobs",
  customer: "/portal",
};

export function homeForRole(role?: string | null): string {
  if (!role) return "/dashboard";
  return ROLE_HOME[role] ?? "/dashboard";
}
