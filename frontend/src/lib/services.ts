import type { Faq } from "./faqs";

export type Service = {
  slug: string;
  name: string;
  navLabel: string;
  icon: "Home" | "Building2" | "Package" | "Gem" | "MapPin" | "Route";
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  heroImage: string;
  features: { title: string; desc: string }[];
  faqs: Faq[];
  related: string[];
};

export const SERVICES: Service[] = [
  {
    slug: "residential-moving",
    name: "Residential Moving",
    navLabel: "Residential Moving",
    icon: "Home",
    metaTitle: "Residential Moving in New Orleans | Southern Magnolia Movers",
    metaDescription:
      "Careful, professional residential moving across New Orleans & Southeast Louisiana. From apartments to estates — request your free estimate today.",
    h1: "Residential Moving in New Orleans",
    intro:
      "From French Quarter apartments to Northshore estates, our crews move your home with care, pride, and craftsmanship — from the first box to the last.",
    heroImage: "/brand/photos/svc-residential.jpg",
    features: [
      { title: "Full-service home moves", desc: "Furniture, boxes, and everything in between — loaded, transported, and placed with care." },
      { title: "Careful handling", desc: "Padding, wrapping, and secure loading protect your floors, walls, and belongings." },
      { title: "Flexible scheduling", desc: "Weekday, weekend, and end-of-month moves across the greater New Orleans area." },
      { title: "Optional packing", desc: "Add full or partial packing so moving day is effortless." },
    ],
    faqs: [
      { q: "How far in advance should I book a residential move?", a: "As early as you can — especially for end-of-month and weekend dates, which fill up fast. Reach out and we'll confirm availability for your preferred day." },
      { q: "Do you move apartments and high-rises?", a: "Yes. We handle apartments, condos, and multi-story buildings throughout New Orleans and Southeast Louisiana." },
    ],
    related: ["local-moving", "packing-services", "specialty-moving"],
  },
  {
    slug: "commercial-moving",
    name: "Commercial Moving",
    navLabel: "Commercial Moving",
    icon: "Building2",
    metaTitle: "Commercial & Office Moving in New Orleans | Southern Magnolia Movers",
    metaDescription:
      "Office and commercial moving that minimizes downtime across New Orleans & Southeast Louisiana. Get a free commercial moving estimate today.",
    h1: "Commercial & Office Moving",
    intro:
      "Offices, storefronts, and workspaces relocated efficiently — so your business keeps moving with minimal downtime.",
    heroImage: "/brand/photos/svc-commercial.jpg",
    features: [
      { title: "Minimal downtime", desc: "We plan around your schedule, including after-hours and weekend moves." },
      { title: "Workstations & equipment", desc: "Desks, cubicles, and office equipment handled with care." },
      { title: "Organized process", desc: "Labeled, staged, and placed so your team is productive fast." },
      { title: "Scalable crews", desc: "From a single suite to a full floor, we size the crew to the job." },
    ],
    faqs: [
      { q: "Can you move our office after hours?", a: "Yes — we regularly schedule evening and weekend commercial moves to avoid disrupting your business." },
      { q: "Do you handle office furniture disassembly?", a: "We can disassemble and reassemble desks, cubicles, and common office furniture as part of your move." },
    ],
    related: ["local-moving", "long-distance-moving", "packing-services"],
  },
  {
    slug: "local-moving",
    name: "Local Moving",
    navLabel: "Local Moving",
    icon: "MapPin",
    metaTitle: "Local Movers in New Orleans & Southeast Louisiana | Southern Magnolia Movers",
    metaDescription:
      "Trusted local movers for moves across New Orleans, Metairie, the Northshore & beyond. Careful crews and clear pricing — free estimate.",
    h1: "Local Moving Across New Orleans",
    intro:
      "Moving across town or across the parish? Our local crews know the area and handle your move with care and clear, upfront pricing.",
    heroImage: "/brand/photos/svc-local.jpg",
    features: [
      { title: "Neighborhood know-how", desc: "Local knowledge of New Orleans, Metairie, Kenner, the Northshore, and more." },
      { title: "Efficient day-of moves", desc: "Quick, careful loading and unloading to keep your day on track." },
      { title: "Clear pricing", desc: "Upfront estimates with no surprises." },
      { title: "Any size move", desc: "Studios, family homes, and everything in between." },
    ],
    faqs: [
      { q: "What areas do you serve for local moves?", a: "New Orleans, Metairie, Kenner, Covington, Mandeville, Slidell, Hammond, Gretna, Laplace, Houma, and surrounding communities." },
      { q: "Do you offer same-week local moves?", a: "Often, yes — availability varies by season. Contact us and we'll do our best to fit your timeline." },
    ],
    related: ["residential-moving", "commercial-moving", "packing-services"],
  },
  {
    slug: "long-distance-moving",
    name: "Long-Distance Moving",
    navLabel: "Long-Distance Moving",
    icon: "Route",
    metaTitle: "Long-Distance Movers in Louisiana | Southern Magnolia Movers",
    metaDescription:
      "Long-distance moving from New Orleans across Louisiana and beyond. Careful handling, dependable crews, clear communication — free estimate.",
    h1: "Long-Distance Moving",
    intro:
      "Leaving the New Orleans area? We move you across Louisiana and beyond — mile after mile, with the same care we bring to every local move.",
    heroImage: "/brand/photos/svc-longdistance.jpg",
    features: [
      { title: "Beyond the region", desc: "Moves across Louisiana and to neighboring states." },
      { title: "Secure transport", desc: "Careful loading and padding for the long haul." },
      { title: "Clear communication", desc: "Stay informed from pickup to delivery." },
      { title: "Coordinated timing", desc: "Planned pickup and delivery windows that work for you." },
    ],
    faqs: [
      { q: "How is long-distance pricing determined?", a: "Long-distance estimates consider distance, the size of your move, and any specialty items. Share your details and we'll provide clear pricing." },
      { q: "How far do you move?", a: "We handle moves across Louisiana and to nearby states. Tell us your destination and we'll confirm we can help." },
    ],
    related: ["residential-moving", "commercial-moving", "specialty-moving"],
  },
  {
    slug: "packing-services",
    name: "Packing Services",
    navLabel: "Packing Services",
    icon: "Package",
    metaTitle: "Professional Packing Services in New Orleans | Southern Magnolia Movers",
    metaDescription:
      "Full or partial packing services in New Orleans & Southeast Louisiana. Quality materials and professional technique — add packing to your free estimate.",
    h1: "Professional Packing Services",
    intro:
      "Full or partial — let our team pack your home with quality materials and professional technique, so moving day is effortless.",
    heroImage: "/brand/photos/svc-packing.jpg",
    features: [
      { title: "Full or partial", desc: "Pack your whole home, or just the tricky, fragile items." },
      { title: "Quality materials", desc: "Sturdy boxes and protective wrapping for safe transport." },
      { title: "Room-by-room", desc: "Organized, labeled packing that makes unpacking easy." },
      { title: "Fragile care", desc: "Extra protection for dishes, glass, and delicate pieces." },
    ],
    faqs: [
      { q: "Can you pack just my kitchen or fragile items?", a: "Absolutely. Choose partial packing for just the rooms or items you want handled professionally." },
      { q: "Do you provide packing materials?", a: "Yes — we bring quality boxes and protective materials as part of our packing service." },
    ],
    related: ["residential-moving", "specialty-moving", "local-moving"],
  },
  {
    slug: "specialty-moving",
    name: "Specialty Moving",
    navLabel: "Specialty Moving",
    icon: "Gem",
    metaTitle: "Specialty Moving: Pianos, Antiques & Art in New Orleans | Southern Magnolia Movers",
    metaDescription:
      "Specialty moving for pianos, antiques, artwork, and fragile pieces in New Orleans & Southeast Louisiana. Trained crews, careful handling — free estimate.",
    h1: "Specialty & Fragile Item Moving",
    intro:
      "Pianos, antiques, artwork, and delicate heirlooms deserve extra care. Our trained crews pad, wrap, and secure your most valued pieces.",
    heroImage: "/brand/photos/svc-specialty.jpg",
    features: [
      { title: "Pianos & heavy items", desc: "Specialized handling for uprights, baby grands, and other heavy pieces." },
      { title: "Antiques & art", desc: "Careful padding and wrapping for fragile, high-value items." },
      { title: "Custom protection", desc: "Tailored materials and technique for each piece." },
      { title: "Peace of mind", desc: "Slow, deliberate handling — nothing rushed." },
    ],
    faqs: [
      { q: "Can you move a piano?", a: "Yes. Our trained crews handle uprights and grand pianos with specialized technique and equipment." },
      { q: "How do you protect antiques and artwork?", a: "Each piece is individually padded, wrapped, and secured to minimize any risk during the move." },
    ],
    related: ["residential-moving", "packing-services", "long-distance-moving"],
  },
];

export const SERVICE_SLUGS = SERVICES.map((s) => s.slug);

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
