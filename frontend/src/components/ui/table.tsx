import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "w-full overflow-x-auto rounded-md border border-slate-200 bg-white shadow-card",
        className
      )}
    >
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  onClick,
  className,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <tr
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "group border-b border-slate-100 last:border-0",
        onClick && "cursor-pointer hover:bg-slate-50",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2.5 text-sm text-slate-700", className)}>
      {children}
    </td>
  );
}
