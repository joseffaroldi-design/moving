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
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner","operations_manager","manager","dispatcher","sales"] },
  { label: "Leads", href: "/dashboard/leads", icon: Users, roles: ["owner","operations_manager","manager","sales"] },
  { label: "Customers", href: "/dashboard/customers", icon: UserRound, roles: ["owner","operations_manager","manager","sales","dispatcher"] },
  { label: "Quotes", href: "/dashboard/quotes", icon: FileText, roles: ["owner","operations_manager","manager","sales"] },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase, roles: ["owner","operations_manager","manager","dispatcher"] },
  { label: "Dispatch", href: "/dashboard/dispatch", icon: CalendarClock, roles: ["owner","operations_manager","manager","dispatcher"] },
  { label: "Invoices", href: "/dashboard/invoices", icon: Receipt, roles: ["owner","operations_manager","manager","sales","dispatcher"] },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3, roles: ["owner","operations_manager","manager"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["owner","operations_manager","manager"] },
];

// Filter staff nav by role. Unknown/absent role → show all (interim/demo).
export function allowedStaffNav(role?: string | null): NavItem[] {
  if (!role) return STAFF_NAV;
  return STAFF_NAV.filter((item) => !item.roles || item.roles.includes(role as Role));
}

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
