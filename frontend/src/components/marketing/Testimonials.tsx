"use client";

import { useState } from "react";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { Reveal } from "./Reveal";

// NOTE: PLACEHOLDER testimonials for design only. Replace with real,
// verified customer reviews before going live. Do not present as genuine.
const REVIEWS = [
  {
    quote:
      "The Southern Magnolia team was professional, careful, and efficient from start to finish. They made a stressful day feel easy.",
    name: "Sarah M.",
    location: "New Orleans, LA",
  },
  {
    quote:
      "They treated our antiques like their own — nothing rushed, nothing damaged. You can tell they take real pride in their work.",
    name: "Marcus T.",
    location: "Metairie, LA",
  },
  {
    quote:
      "From the estimate to the final box, everything was smooth and on time. Honestly the best movers we've ever hired.",
    name: "Danielle R.",
    location: "Covington, LA",
  },
];

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const review = REVIEWS[index];
  const go = (dir: number) =>
    setIndex((i) => (i + dir + REVIEWS.length) % REVIEWS.length);

  return (
    <section
      className="relative overflow-hidden bg-navy-900 py-20 md:py-28"
      data-testid="testimonials-section"
    >
      <div className="grain absolute inset-0" />
      <div className="relative mx-auto max-w-4xl px-6 text-center md:px-10">
        <Reveal>
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            What Our Customers Say
          </p>
          <div className="mx-auto mt-5 flex items-center justify-center gap-1 text-gold">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-gold" strokeWidth={0} />
            ))}
          </div>
          <Quote className="mx-auto mt-8 h-9 w-9 text-gold/40" strokeWidth={1.5} />
          <blockquote
            key={index}
            data-testid="testimonial-quote"
            className="mx-auto mt-6 max-w-3xl animate-fade-in font-serif text-2xl font-medium leading-snug text-cream md:text-3xl md:leading-snug"
          >
            &ldquo;{review.quote}&rdquo;
          </blockquote>
          <div className="mt-8">
            <p className="font-heading text-sm font-semibold uppercase tracking-wide text-gold-light">
              {review.name}
            </p>
            <p className="mt-1 text-sm text-cream/50">{review.location}</p>
          </div>
        </Reveal>

        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            onClick={() => go(-1)}
            aria-label="Previous review"
            data-testid="testimonial-prev"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/20 text-cream/70 transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {REVIEWS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to review ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? "w-6 bg-gold" : "w-2 bg-cream/25 hover:bg-cream/50"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => go(1)}
            aria-label="Next review"
            data-testid="testimonial-next"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/20 text-cream/70 transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
