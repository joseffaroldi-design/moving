"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Reveal } from "./Reveal";

const FAQS = [
  {
    q: "How do I get a moving estimate?",
    a: "Request a free estimate through the form on this page or give us a call. We'll review the details of your move and provide clear, upfront pricing — no surprises.",
  },
  {
    q: "Do you handle both residential and commercial moves?",
    a: "Yes. From studio apartments and family homes to offices and storefronts, we handle moves of every size across New Orleans and Southeast Louisiana.",
  },
  {
    q: "Can you move pianos, antiques, and fragile items?",
    a: "Absolutely. Specialty items are our specialty. Pianos, artwork, antiques, and delicate pieces are padded, wrapped, and secured by our trained crew.",
  },
  {
    q: "How do you protect my belongings?",
    a: "Protecting your belongings is our top priority. Every move is handled by trained, professional movers who pad, wrap, and secure your items with care. For specifics about our coverage and credentials, give us a call and we'll gladly walk you through the details.",
  },
  {
    q: "Do you offer packing services?",
    a: "Yes — full or partial. We can pack your entire home, or just the tricky items, using quality materials and professional technique.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faqs"
      className="anchor bg-cream-100 py-20 md:py-28"
      data-testid="faq-section"
    >
      <div className="mx-auto max-w-3xl px-6 md:px-10">
        <Reveal className="text-center">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold-hover">
            Questions & Answers
          </p>
          <h2 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-tight text-navy md:text-5xl">
            Good to Know.
          </h2>
        </Reveal>

        <div className="mt-12">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 60}>
                <div className="border-b border-navy/10">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    data-testid={`faq-toggle-${i}`}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left"
                  >
                    <span className="font-serif text-lg font-medium text-navy md:text-xl">
                      {item.q}
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold-hover">
                      {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-500 ease-out ${
                      isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="text-base leading-relaxed text-navy/70">
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
