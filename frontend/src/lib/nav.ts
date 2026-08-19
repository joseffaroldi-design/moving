import {
  LayoutDashboard,
  Users,
  UserRound,
  FileText,
  FileSignature,
  Truck,
  CalendarClock,
  Receipt,
  BarChart3,
  Settings,
  Briefcase,
  Mail,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export interface NavItem { label:string; href:string; icon:LucideIcon; roles?:Role[]; }
export const STAFF_NAV: NavItem[] = [
  { label:"Dashboard",href:"/dashboard",icon:LayoutDashboard,roles:["owner","operations_manager","dispatcher","sales"] },
  { label:"Leads",href:"/dashboard/leads",icon:Users,roles:["owner","operations_manager","sales"] },
  { label:"Customers",href:"/dashboard/customers",icon:UserRound,roles:["owner","operations_manager","sales","dispatcher"] },
  { label:"Quotes",href:"/dashboard/quotes",icon:FileText,roles:["owner","operations_manager","sales"] },
  { label:"Jobs",href:"/dashboard/jobs",icon:Briefcase,roles:["owner","operations_manager","dispatcher"] },
  { label:"Move Documents",href:"/dashboard/documents",icon:FileSignature,roles:["owner","operations_manager"] },
  { label:"Dispatch",href:"/dashboard/dispatch",icon:CalendarClock,roles:["owner","operations_manager","dispatcher"] },
  { label:"Invoices",href:"/dashboard/invoices",icon:Receipt,roles:["owner","operations_manager","sales","dispatcher"] },
  { label:"Customer Emails",href:"/dashboard/communications",icon:Mail,roles:["owner","operations_manager","sales","dispatcher"] },
  { label:"Reports",href:"/dashboard/reports",icon:BarChart3,roles:["owner","operations_manager"] },
  { label:"Settings",href:"/dashboard/settings",icon:Settings,roles:["owner","operations_manager"] },
];
export function allowedStaffNav(role?:string|null):NavItem[]{ if(!role)return STAFF_NAV; return STAFF_NAV.filter(i=>!i.roles||i.roles.includes(role as Role)); }
export const PORTAL_NAV:NavItem[]=[
 {label:"Overview",href:"/portal",icon:LayoutDashboard},{label:"Quotes",href:"/portal/quotes",icon:FileText},{label:"My Move",href:"/portal/jobs",icon:Briefcase},{label:"Payments",href:"/portal/payments",icon:Receipt},{label:"Profile",href:"/portal/profile",icon:UserRound},{label:"Documents",href:"/portal/documents",icon:FileSignature},
];
export const MOBILE_NAV:NavItem[]=[{label:"Jobs",href:"/mobile/jobs",icon:Briefcase},{label:"Clock",href:"/mobile/clock",icon:CalendarClock},{label:"Photos",href:"/mobile/photos",icon:Truck},{label:"Checklists",href:"/mobile/checklists",icon:FileText}];
export const ROLE_HOME:Record<string,string>={owner:"/dashboard",operations_manager:"/dashboard",dispatcher:"/dashboard/dispatch",sales:"/dashboard/leads",crew_lead:"/mobile/jobs",mover:"/mobile/jobs",customer:"/portal"};
export function homeForRole(role?:string|null):string{if(!role)return "/dashboard";return ROLE_HOME[role]??"/dashboard";}
