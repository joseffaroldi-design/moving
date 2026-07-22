import { cn } from "@/lib/utils";
import { statusTone, toneClasses } from "@/lib/status";
import { titleCase } from "@/lib/format";
import type { BadgeTone } from "@/lib/status";

export function StatusBadge({
  status,
  tone,
  className,
  "data-testid": testId,
}: {
  status: string | null | undefined;
  tone?: BadgeTone;
  className?: string;
  "data-testid"?: string;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        toneClasses[resolved],
        className
      )}
    >
      {titleCase(status) || "—"}
    </span>
  );
}
