"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Reveal } from "./Reveal";
import { HOME_FAQS as FAQS } from "@/lib/faqs";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faqs"
      className="anchor bg-cream-100 py-20 md:py-28 lg:py-36"
      data-testid="faq-section"
    >
      <div className="mx-auto max-w-3xl px-6 md:px-10 lg:max-w-5xl lg:px-12">
        <Reveal className="text-center">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover lg:tracking-[0.3em]">
            Questions & Answers
          </p>
          <h2 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-tight text-navy md:text-5xl lg:mt-5 lg:text-[3.5rem]">
            Good to Know.
          </h2>
          <div className="mx-auto mt-5 hidden h-px w-16 bg-gold/70 lg:block" />
        </Reveal>

        <div className="mt-12 lg:mt-14 lg:border-y lg:border-navy/[0.08]">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 60}>
                <div className="border-b border-navy/10 lg:border-navy/[0.08] lg:px-2 last:lg:border-b-0">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    data-testid={`faq-toggle-${i}`}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left lg:py-6"
                  >
                    <span className="font-serif text-lg font-medium text-navy md:text-xl lg:text-[1.35rem]">
                      {item.q}
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold-hover lg:h-9 lg:w-9 lg:transition-[background-color,border-color,color] lg:duration-300 lg:hover:border-gold lg:hover:bg-gold lg:hover:text-navy">
                      {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-500 ease-out ${
                      isOpen ? "grid-rows-[1fr] pb-5 lg:pb-7" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="text-base leading-relaxed text-navy/70 lg:max-w-3xl lg:text-[17px] lg:leading-8">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
