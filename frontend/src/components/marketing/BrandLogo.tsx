import Image from "next/image";
import { cn } from "@/lib/utils";

// Official Southern Magnolia Movers logo (frame removed for web; identity
// preserved). Cream-native artwork — use `plaque` on dark surfaces.
export function BrandLogo({
  className,
  height = 44,
  plaque = false,
  priority = false,
}: {
  className?: string;
  height?: number;
  plaque?: boolean;
  priority?: boolean;
}) {
  const width = Math.round((height * 1800) / 716);
  const img = (
    <Image
      src="/brand/logo-lockup.png"
      alt="Southern Magnolia Movers"
      width={width}
      height={height}
      priority={priority}
      className="h-auto w-auto"
      style={{ height, width: "auto" }}
    />
  );
  if (plaque) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-sm bg-cream px-5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.18)]",
          className
        )}
      >
        {img}
      </span>
    );
  }
  return <span className={cn("inline-flex items-center", className)}>{img}</span>;
}
