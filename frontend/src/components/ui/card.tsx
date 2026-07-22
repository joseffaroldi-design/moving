import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 bg-white shadow-card",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-slate-200 px-4 py-3",
        className
      )}
    >
      <h3 className="font-heading text-sm font-semibold text-navy">{title}</h3>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  "data-testid": testId,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-start justify-between rounded-md border border-slate-200 bg-white p-4 shadow-card"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="mt-1.5 font-heading text-2xl font-bold text-navy">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {Icon && (
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-muted">
          <Icon className="h-5 w-5 text-accent" />
        </div>
      )}
    </div>
  );
}
