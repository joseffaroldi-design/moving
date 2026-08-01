"use client";

import { useState } from "react";
import Link from "next/link";
import { CITIES } from "@/lib/cities";

// Approximate, stylized layout (west → east) of the Greater New Orleans metro.
// Decorative service-area map — not to scale.
const POS: Record<string, { x: number; y: number }> = {
  kenner: { x: 90, y: 150 },
  "river-ridge": { x: 165, y: 250 },
  harahan: { x: 215, y: 235 },
  elmwood: { x: 250, y: 200 },
  metairie: { x: 300, y: 175 },
  jefferson: { x: 340, y: 250 },
  lakeview: { x: 400, y: 130 },
  "mid-city": { x: 470, y: 205 },
  uptown: { x: 460, y: 305 },
  "garden-district": { x: 545, y: 285 },
  "new-orleans": { x: 545, y: 220 },
  "french-quarter": { x: 640, y: 235 },
};

export function ServiceAreaMap({ className = "" }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className={`relative ${className}`} data-testid="service-area-map">
      <svg
        viewBox="0 0 760 420"
        className="h-auto w-full"
        role="img"
        aria-label="Map of the Greater New Orleans areas served by Southern Magnolia Movers"
      >
        {/* Lake Pontchartrain */}
        <path d="M0 0 H760 V95 C600 70 400 55 250 78 C150 92 60 88 0 70 Z" fill="#12395e" opacity="0.55" />
        <text x="360" y="42" textAnchor="middle" className="fill-cream/40" fontSize="13" letterSpacing="3">
          LAKE PONTCHARTRAIN
        </text>
        {/* Mississippi River */}
        <path
          d="M0 300 C160 340 260 200 380 260 C500 320 560 210 760 250"
          fill="none"
          stroke="#0b2038"
          strokeWidth="26"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M0 300 C160 340 260 200 380 260 C500 320 560 210 760 250"
          fill="none"
          stroke="#C89A3D"
          strokeWidth="1.5"
          opacity="0.3"
          strokeDasharray="4 6"
        />

        {CITIES.map((c) => {
          const p = POS[c.slug];
          if (!p) return null;
          const isActive = active === c.slug;
          return (
            <Link key={c.slug} href={`/service-areas/${c.slug}`} aria-label={`${c.name} movers`}>
              <g
                className="cursor-pointer"
                onMouseEnter={() => setActive(c.slug)}
                onMouseLeave={() => setActive(null)}
                data-testid={`map-pin-${c.slug}`}
              >
                <circle cx={p.x} cy={p.y} r={isActive ? 18 : 10} fill="#C89A3D" opacity={isActive ? 0.25 : 0.15} className="transition-all duration-200" />
                <circle cx={p.x} cy={p.y} r={5} fill="#C89A3D" stroke="#0B2038" strokeWidth="1.5" />
                <text
                  x={p.x}
                  y={p.y - 14}
                  textAnchor="middle"
                  fontSize="12"
                  className={`pointer-events-none font-semibold transition-all duration-200 ${isActive ? "fill-cream" : "fill-cream/70"}`}
                >
                  {c.name}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}
