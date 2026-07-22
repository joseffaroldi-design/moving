import { cn } from "@/lib/utils";

// Crescent moon embracing the New Orleans skyline — the Southern Magnolia mark.
export function CrescentMark({
  className,
  color = "#C89A3D",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="Southern Magnolia Movers crescent mark"
      fill="none"
    >
      <defs>
        <mask id="crescent-cut">
          <rect width="40" height="40" fill="white" />
          <circle cx="27" cy="20" r="15.5" fill="black" />
        </mask>
      </defs>
      <circle cx="20" cy="20" r="18" fill={color} mask="url(#crescent-cut)" />
      {/* small fleur-de-lis accent inside the crescent opening */}
      <path
        d="M27 12c-1 1.6-1 3.2 0 4.8-1.6-.6-3 .2-3 1.9 0 1.2 1 2 2.1 2h-1.6v1.6h1.1v1.4h2.8v-1.4h1.1V22h-1.6c1.1 0 2.1-.8 2.1-2 0-1.7-1.4-2.5-3-1.9 1-1.6 1-3.2 0-4.8z"
        fill={color}
        opacity="0.9"
      />
    </svg>
  );
}

export function FleurDeLis({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2c-1.4 2.2-1.4 4.4 0 6.6-2.3-.9-4.3.3-4.3 2.7 0 1.7 1.4 2.9 3 2.9H9.3V16H11v2.2c-1.1.2-2 .8-2 1.9h6c0-1.1-.9-1.7-2-1.9V16h1.7v-1.8h-1.4c1.6 0 3-1.2 3-2.9 0-2.4-2-3.6-4.3-2.7C13.4 6.4 13.4 4.2 12 2z" />
    </svg>
  );
}

// Full horizontal wordmark lockup. `variant` controls colors for dark/light surfaces.
export function Logo({
  variant = "dark",
  className,
  showMark = true,
}: {
  variant?: "dark" | "light"; // dark = for light bg (navy text); light = for navy bg (cream text)
  className?: string;
  showMark?: boolean;
}) {
  const wordColor = variant === "light" ? "text-cream" : "text-navy";
  const subColor = variant === "light" ? "text-gold" : "text-gold-hover";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {showMark && <CrescentMark className="h-9 w-9 shrink-0" />}
      <div className="leading-none">
        <div className={cn("font-serif text-[15px] font-bold tracking-tight", wordColor)}>
          Southern Magnolia
        </div>
        <div className={cn("text-[10px] font-semibold uppercase tracking-[0.35em]", subColor)}>
          Movers
        </div>
      </div>
    </div>
  );
}
