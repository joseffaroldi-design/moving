import { Star } from "lucide-react";
import { BRAND } from "@/lib/brand";

const configuredReviewUrl: string = BRAND.googleReviewUrl;
const reviewHref =
  configuredReviewUrl.length > 0
    ? configuredReviewUrl
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${BRAND.name} New Orleans`
      )}`;

export function ReviewCTA() {
  return (
    <section className="bg-navy py-16 md:py-20 lg:py-24" data-testid="review-cta">
      <div className="mx-auto max-w-3xl px-6 text-center md:px-10">
        <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-6 w-6 fill-gold text-gold" strokeWidth={1} />
          ))}
        </div>
        <h2 className="mt-6 font-serif text-3xl font-medium tracking-tight text-cream md:text-4xl lg:text-[2.75rem]">
          Loved your move? Tell New Orleans.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-cream/70">
          Your review helps other families find a moving crew they can trust —
          and it takes less than a minute.
        </p>
        <a
          href={reviewHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="leave-google-review"
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-8 py-4 text-sm font-semibold uppercase tracking-wide text-navy transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-gold-hover hover:shadow-[0_14px_32px_rgb(200,154,61,0.28)]"
        >
          <Star className="h-4 w-4 fill-navy text-navy" strokeWidth={1} />
          Leave a Google Review
        </a>
      </div>
    </section>
  );
}
