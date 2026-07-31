"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Robust scroll reveal: content is VISIBLE by default (SSR + no-JS safe).
// On mount we only "arm" elements that are below the fold, then reveal them
// as they scroll into view. Elements already in view render immediately — so
// nothing is ever trapped at opacity:0 if the observer/JS misbehaves.
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) {
      setState("shown");
      return;
    }

    const rect = el.getBoundingClientRect();
    const belowFold = rect.top > window.innerHeight * 0.85;
    if (!belowFold) {
      setState("shown");
      return;
    }

    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        className,
        state === "hidden" && "reveal",
        state === "shown" && "reveal reveal-in"
      )}
      style={delay && state !== "idle" ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
