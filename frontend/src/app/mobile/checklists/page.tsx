"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ITEMS = [
  "Arrive at origin & confirm inventory",
  "Protect floors and doorways",
  "Wrap and pad all furniture",
  "Load truck & secure items",
  "Confirm destination address",
  "Unload & place items in rooms",
  "Walkthrough with customer",
  "Collect signature & payment",
];

export default function MobileChecklistPage() {
  const [checked, setChecked] = useState<boolean[]>(DEFAULT_ITEMS.map(() => false));
  const done = checked.filter(Boolean).length;

  function toggle(i: number) {
    setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold text-navy">Move Checklist</h1>
        <span className="text-sm font-medium text-slate-500">
          {done}/{DEFAULT_ITEMS.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-card">
        {DEFAULT_ITEMS.map((item, i) => (
          <button
            key={i}
            data-testid={`checklist-item-${i}`}
            onClick={() => toggle(i)}
            className="flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left last:border-0 active:bg-slate-50"
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                checked[i] ? "border-accent bg-accent text-white" : "border-slate-300 bg-white"
              )}
            >
              {checked[i] && <Check className="h-4 w-4" />}
            </span>
            <span className={cn("text-sm", checked[i] ? "text-slate-400 line-through" : "text-slate-700")}>
              {item}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
