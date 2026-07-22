"use client";

import { useDashboardData } from "@/components/data/DashboardProvider";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, ChevronRight } from "lucide-react";
import { jobCustomer, addr } from "@/lib/entities";
import { formatDate } from "@/lib/format";
import { DashboardProvider } from "@/components/data/DashboardProvider";

function JobsList() {
  const { data, loading } = useDashboardData();
  const jobs = data?.upcomingJobs ?? [];

  return (
    <div>
      <h1 className="mb-4 font-heading text-xl font-bold text-navy">My Jobs</h1>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState title="No assigned jobs" description="Jobs assigned to your crew will appear here." />
      ) : (
        <div className="space-y-3">
          {jobs.map((j, i) => (
            <div key={(j.id as string) ?? i} data-testid={`mobile-job-${i}`} className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm font-bold text-navy">{j.job_number || "Job"}</span>
                <StatusBadge status={j.status as string} />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-700">{jobCustomer(j)}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> {addr(j, "origin")}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <ChevronRight className="h-3.5 w-3.5 text-accent" /> {addr(j, "destination")}
              </p>
              <p className="mt-2 text-xs text-slate-400">{formatDate(j.scheduled_start as string)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MobileJobsPage() {
  return (
    <DashboardProvider>
      <JobsList />
    </DashboardProvider>
  );
}
