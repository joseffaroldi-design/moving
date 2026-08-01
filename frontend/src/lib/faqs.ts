export type Faq = { q: string; a: string };

// Shared homepage FAQ content — rendered visibly by FAQ.tsx AND emitted as
// FAQPage JSON-LD on the homepage (structured data must match visible content).
export const HOME_FAQS: Faq[] = [
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
