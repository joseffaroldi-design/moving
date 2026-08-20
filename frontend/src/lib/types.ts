// Shared domain types for MoveOps. Kept intentionally loose where the live
// Supabase schema shape is confirmed at runtime via the mvp-dashboard payload.

export type Role =
  | "owner"
  | "operations_manager"
  | "manager"
  | "dispatcher"
  | "sales"
  | "crew_lead"
  | "mover"
  | "crew"
  | "customer";

export interface Customer {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Lead {
  id: string;
  customer_name?: string;
  customer_id?: string;
  status?: string;
  source?: string;
  lead_source?: string;
  origin?: string;
  origin_address?: string;
  destination?: string;
  destination_address?: string;
  move_date?: string;
  estimated_volume?: number | string;
  estimated_cubic_feet?: number | string;
  assigned_to?: string;
  created_at?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface Quote {
  id: string;
  quote_number?: string;
  customer_name?: string;
  customer_id?: string;
  status?: string;
  total?: number | string;
  subtotal?: number | string;
  tax?: number | string;
  discount?: number | string;
  hourly_rate?: number | string;
  estimated_hours?: number | string;
  travel_fee?: number | string;
  packing_fee?: number | string;
  materials_fee?: number | string;
  expires_at?: string;
  expiration_date?: string;
  sent_at?: string;
  accepted_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Job {
  id: string;
  job_number?: string;
  customer_name?: string;
  customer_id?: string;
  status?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  origin?: string;
  origin_address?: string;
  destination?: string;
  destination_address?: string;
  crew_size?: number;
  truck_count?: number;
  dispatch_notes?: string;
  quote_id?: string;
  [key: string]: unknown;
}

export interface Truck {
  id: string;
  name?: string;
  label?: string;
  license_plate?: string;
  capacity?: number | string;
  status?: string;
  [key: string]: unknown;
}

export interface DispatchAssignment {
  id: string;
  job_id?: string;
  truck_id?: string;
  crew_lead?: string;
  route_order?: number;
  start_window?: string;
  end_window?: string;
  status?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface OnboardingStep {
  id?: string;
  title?: string;
  name?: string;
  label?: string;
  completed?: boolean;
  is_complete?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface DashboardCounts {
  customers: number;
  leads: number;
  quotes: number;
  jobs: number;
  dispatchAssignments: number;
  trucks: number;
}

export interface ReportingSummary {
  leadCount: number;
  quotedLeadCount: number;
  quotesSentCount: number;
  quotesDecidedCount: number;
  quotesWonCount: number;
  jobsFromQuotesCount: number;
  upcomingJobsCount: number;
  dispatchedUpcomingJobsCount: number;
  openPipelineValue: number;
  averageQuoteValue: number;
  collectedRevenue: number;
  unpaidInvoiceCount: number;
  unpaidInvoiceBalance: number;
  laborHours: number;
  completedJobBilled: number;
  completedJobExpenses: number;
  basicJobMargin: number;
}

export interface NormalizedDashboard {
  company: { name?: string; id?: string } | null;
  counts: DashboardCounts;
  reporting: ReportingSummary;
  onboarding: { completed: number; total: number; steps: OnboardingStep[] };
  recentLeads: Lead[];
  recentQuotes: Quote[];
  upcomingJobs: Job[];
  trucks: Truck[];
  customers: Customer[];
  dispatchAssignments: DispatchAssignment[];
  raw: unknown;
}

export interface MeResponse {
  user?: { id: string; email?: string } | null;
  profile?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
  role?: Role | string | null;
  navigation?: unknown[];
  counts?: Record<string, number>;
  needs_profile?: boolean;
  needsProfile?: boolean;
  profile_completion?: unknown;
  [key: string]: unknown;
}
