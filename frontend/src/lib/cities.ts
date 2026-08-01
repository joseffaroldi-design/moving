import type { Faq } from "./faqs";

export type City = {
  slug: string;
  name: string;
  region: string; // parish
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[]; // unique paragraphs
  neighborhoods: string[];
  landmarks: string[];
  faqs: Faq[];
  nearby: string[]; // city slugs
  heroImage: string;
  featured?: boolean; // shown on homepage
};

export const CITIES: City[] = [
  {
    slug: "new-orleans",
    name: "New Orleans",
    region: "Orleans Parish",
    metaTitle: "New Orleans Movers | Southern Magnolia Movers",
    metaDescription:
      "Local movers serving all of New Orleans — from the French Quarter to Lakeview. Careful crews, clear pricing, deep local roots. Free estimate today.",
    h1: "Moving Company in New Orleans",
    intro: [
      "New Orleans is our home, and it shows in every move we make. Narrow one-way streets, historic shotgun homes, second-floor Creole cottages, and tight French Quarter courtyards are second nature to our crews — because we grew up navigating them.",
      "Whether you're settling into a Marigny double or relocating an office downtown, we bring the patience and local know-how a city this characterful demands. No shortcuts, no surprises — just careful hands and honest work.",
    ],
    neighborhoods: ["French Quarter", "Uptown", "Mid-City", "Marigny", "Bywater", "Lakeview", "Algiers Point"],
    landmarks: ["Jackson Square", "City Park", "St. Charles Streetcar Line", "Audubon Park", "Caesars Superdome"],
    faqs: [
      { q: "Can you handle a move in the French Quarter's tight streets?", a: "Yes — Quarter moves are routine for us. We plan around one-way streets, limited parking, and delivery windows, and we protect balconies, courtyards, and historic staircases with care." },
      { q: "Do you move historic shotgun and Creole cottage homes?", a: "Absolutely. Our crews know how to work with narrow doorways, steep stoops, and second-floor entries common across New Orleans without damaging original details." },
    ],
    nearby: ["metairie", "uptown", "mid-city", "french-quarter"],
    heroImage: "/brand/photos/why-nola.jpg",
    featured: true,
  },
  {
    slug: "metairie",
    name: "Metairie",
    region: "Jefferson Parish",
    metaTitle: "Metairie Movers | Southern Magnolia Movers",
    metaDescription:
      "Trusted Metairie movers for homes and businesses across Old Metairie, Bucktown & Fat City. Dependable crews and upfront pricing — get a free estimate.",
    h1: "Moving Company in Metairie",
    intro: [
      "Metairie's mix of established family neighborhoods and busy commercial corridors keeps our crews moving every week. From the oak-shaded streets of Old Metairie to the condos near Lakeside, we know the parish inside and out.",
      "It's a short hop from our New Orleans base, so we keep local Metairie moves efficient and affordable — right-sized crews, on-time arrivals, and the same careful handling whether you're crossing the street or the parish line.",
    ],
    neighborhoods: ["Old Metairie", "Bucktown", "Fat City", "Metairie Club Gardens", "Bonnabel"],
    landmarks: ["Lakeside Shopping Center", "Metairie Cemetery", "Bonnabel Boat Launch", "Lafreniere Park"],
    faqs: [
      { q: "Do you move both Old Metairie homes and Lakeside-area condos?", a: "Yes. We handle everything from large Old Metairie family homes to high-rise and mid-rise condos near Lakeside, adjusting our crew and equipment to the property." },
      { q: "How quickly can you schedule a Metairie move?", a: "Because Metairie is minutes from our base, we can often accommodate short-notice local moves — availability depends on the season, so reach out early for end-of-month dates." },
    ],
    nearby: ["kenner", "harahan", "elmwood", "new-orleans"],
    heroImage: "/brand/photos/why-truck.jpg",
    featured: true,
  },
  {
    slug: "kenner",
    name: "Kenner",
    region: "Jefferson Parish",
    metaTitle: "Kenner Movers | Southern Magnolia Movers",
    metaDescription:
      "Kenner movers serving Rivertown, Laketown & University City. From airport-area relocations to family homes — careful, professional service. Free estimate.",
    h1: "Moving Company in Kenner",
    intro: [
      "Sitting at the western edge of Jefferson Parish beside Louis Armstrong International Airport, Kenner is a natural landing spot for families and professionals moving into the area — and often the first stop for those relocating to Greater New Orleans.",
      "From the historic charm of Rivertown to the lakefront at Laketown and the subdivisions of University City, our crews handle Kenner moves with the same care and clear pricing we bring across the metro.",
    ],
    neighborhoods: ["Rivertown", "Laketown", "University City", "Chateau Estates", "Highway Park"],
    landmarks: ["Louis Armstrong New Orleans International Airport", "Rivertown", "Laketown", "Pontchartrain Center"],
    faqs: [
      { q: "Do you help with relocations for people new to the New Orleans area?", a: "Often, yes — Kenner is a common arrival point near the airport. Tell us where you're coming from and we'll coordinate timing for your delivery and unload." },
      { q: "Can you move large family homes in University City and Chateau Estates?", a: "Yes. We size the crew and truck to the home, so larger Kenner subdivisions are no problem." },
    ],
    nearby: ["metairie", "harahan", "river-ridge"],
    heroImage: "/brand/photos/svc-longdistance.jpg",
    featured: true,
  },
  {
    slug: "lakeview",
    name: "Lakeview",
    region: "Orleans Parish",
    metaTitle: "Lakeview Movers (New Orleans) | Southern Magnolia Movers",
    metaDescription:
      "Lakeview movers for the lakefront's rebuilt homes and modern builds. Careful crews near City Park and Harrison Avenue — request your free estimate.",
    h1: "Moving Company in Lakeview",
    intro: [
      "Lakeview's tree-lined streets and beautifully rebuilt homes sit between City Park and the shores of Lake Pontchartrain. Many of the area's residences are newer, spacious builds — and our crews are well-practiced at moving them with care.",
      "From the shops along Harrison Avenue to the quiet blocks near Lake Vista, we make Lakeview moves smooth, protecting the modern finishes and open floor plans that define the neighborhood.",
    ],
    neighborhoods: ["West End", "Lake Vista", "Lakeshore", "Navarre", "Country Club Gardens"],
    landmarks: ["Lake Pontchartrain", "City Park", "Harrison Avenue", "New Orleans Lakefront"],
    faqs: [
      { q: "Do you move large, modern Lakeview homes?", a: "Yes. Many Lakeview homes are newer, larger builds — we bring the right crew size and padding to protect updated floors, staircases, and finishes." },
      { q: "Are you familiar with the streets near City Park and the lakefront?", a: "Very. We move throughout Lakeview regularly and plan around the neighborhood's layout for an efficient, low-stress day." },
    ],
    nearby: ["mid-city", "metairie", "new-orleans"],
    heroImage: "/brand/photos/svc-residential.jpg",
    featured: true,
  },
  {
    slug: "uptown",
    name: "Uptown",
    region: "Orleans Parish",
    metaTitle: "Uptown New Orleans Movers | Southern Magnolia Movers",
    metaDescription:
      "Uptown New Orleans movers for historic homes along St. Charles Avenue and near Tulane & Loyola. Careful with character homes — free estimate.",
    h1: "Moving Company in Uptown New Orleans",
    intro: [
      "Uptown is streetcars, live oaks, and grand historic homes along St. Charles Avenue — plus the busy student corridors around Tulane and Loyola. Each type of move calls for a different rhythm, and our crews adapt to all of them.",
      "We're careful with the tall ceilings, original hardwood, and narrow side passages that give Uptown homes their character, and we're just as at home with quick student and apartment moves near the universities.",
    ],
    neighborhoods: ["Audubon", "Carrollton", "Freret", "Milan", "University area"],
    landmarks: ["St. Charles Avenue", "Audubon Park", "Tulane University", "Loyola University", "Magazine Street"],
    faqs: [
      { q: "Do you move student apartments near Tulane and Loyola?", a: "Yes — we handle plenty of student and apartment moves Uptown, and we can work around tight leasing timelines and shared building access." },
      { q: "Can you protect original details in historic Uptown homes?", a: "That's our specialty. We pad staircases, doorways, and hardwood, and we take extra care with the fragile, high-value pieces common in these homes." },
    ],
    nearby: ["garden-district", "new-orleans", "mid-city"],
    heroImage: "/brand/photos/hero-crew.jpg",
    featured: true,
  },
  {
    slug: "mid-city",
    name: "Mid-City",
    region: "Orleans Parish",
    metaTitle: "Mid-City New Orleans Movers | Southern Magnolia Movers",
    metaDescription:
      "Mid-City movers near Bayou St. John and City Park. Careful with doubles, camelbacks & apartments along Canal Street — request your free estimate.",
    h1: "Moving Company in Mid-City",
    intro: [
      "Centered on Bayou St. John and the edge of City Park, Mid-City is a walkable mix of classic doubles, camelbacks, and newer apartments along the Canal Street corridor. It's one of the most connected parts of the city — and one we move through constantly.",
      "Our crews know the neighborhood's mix of housing styles and plan each move around bayou-side streets, streetcar lines, and shared driveways so your day stays on schedule.",
    ],
    neighborhoods: ["Bayou St. John", "Faubourg St. John", "Parkview", "Tulane/Gravier", "Canal Street corridor"],
    landmarks: ["City Park", "Bayou St. John", "New Orleans Museum of Art", "Canal Street"],
    faqs: [
      { q: "Do you move doubles and camelback homes in Mid-City?", a: "Regularly. These homes often have narrow entries and tricky staircases — our crews handle them carefully and efficiently." },
      { q: "Can you coordinate around the Canal streetcar and bayou-side streets?", a: "Yes. We plan parking and loading around the streetcar line and Mid-City's layout to keep your move smooth." },
    ],
    nearby: ["lakeview", "uptown", "new-orleans"],
    heroImage: "/brand/photos/svc-local.jpg",
    featured: true,
  },
  {
    slug: "garden-district",
    name: "Garden District",
    region: "Orleans Parish",
    metaTitle: "Garden District Movers (New Orleans) | Southern Magnolia Movers",
    metaDescription:
      "Garden District movers experienced with historic mansions, antiques & fine furnishings near Magazine Street. White-glove care — free estimate.",
    h1: "Moving Company in the Garden District",
    intro: [
      "The Garden District is one of America's most beautiful historic neighborhoods — grand 19th-century mansions, wrought-iron fences, and oak-canopied streets around Magazine Street and Prytania. Moves here demand a gentle, deliberate touch.",
      "Our crews are trained for exactly this: navigating tall staircases and delicate doorways, and protecting antiques, artwork, and heirloom furnishings that deserve white-glove handling from start to finish.",
    ],
    neighborhoods: ["Lower Garden District", "Irish Channel", "Magazine Street corridor", "Prytania"],
    landmarks: ["Lafayette Cemetery No. 1", "Magazine Street", "Commander's Palace", "St. Charles Avenue"],
    faqs: [
      { q: "Do you have experience moving antiques and fine furnishings?", a: "Yes — the Garden District is full of high-value pieces, and our specialty-moving crews individually pad, wrap, and secure antiques, art, and heirlooms." },
      { q: "Can you handle the tall staircases in historic mansions?", a: "We do it often. We bring extra hands and protective padding to move large pieces safely through historic entries and stairwells." },
    ],
    nearby: ["uptown", "french-quarter", "new-orleans"],
    heroImage: "/brand/photos/svc-specialty.jpg",
    featured: true,
  },
  {
    slug: "french-quarter",
    name: "French Quarter",
    region: "Orleans Parish",
    metaTitle: "French Quarter Movers (New Orleans) | Southern Magnolia Movers",
    metaDescription:
      "French Quarter movers who know the Vieux Carré — tight streets, courtyards & upper balconies. Permits and parking planned. Free estimate.",
    h1: "Moving Company in the French Quarter",
    intro: [
      "Moving in the Vieux Carré is unlike anywhere else: narrow one-way streets, no driveways, second- and third-floor apartments over courtyards, and strict parking. Our crews plan Quarter moves down to the detail so nothing is left to chance.",
      "From Royal Street antiques to a balcony apartment above a courtyard, we protect fragile finishes and historic staircases while keeping loading windows tight and respectful of the neighborhood.",
    ],
    neighborhoods: ["Vieux Carré", "Lower Quarter", "Upper Quarter", "Marigny (adjacent)"],
    landmarks: ["Jackson Square", "St. Louis Cathedral", "Royal Street", "French Market", "Bourbon Street"],
    faqs: [
      { q: "How do you handle parking and loading in the French Quarter?", a: "We scout access ahead of time and plan the shortest, safest carry path, coordinating tight loading windows since driveways are rare in the Quarter." },
      { q: "Can you move furniture up to a second- or third-floor Quarter apartment?", a: "Yes. Upper-floor courtyard apartments are common here — we bring the crew and equipment to move your belongings up safely." },
    ],
    nearby: ["garden-district", "mid-city", "new-orleans"],
    heroImage: "/brand/photos/why-nola.jpg",
    featured: true,
  },
  {
    slug: "harahan",
    name: "Harahan",
    region: "Jefferson Parish",
    metaTitle: "Harahan Movers | Southern Magnolia Movers",
    metaDescription:
      "Harahan movers for this quiet riverside Jefferson Parish community. Family homes handled with care near the levee and Hickory Avenue — free estimate.",
    h1: "Moving Company in Harahan",
    intro: [
      "Tucked along the Mississippi River levee in Jefferson Parish, Harahan is a close-knit, residential community of established family homes. It's the kind of neighborhood where a careful, respectful crew makes all the difference.",
      "We move Harahan families with the personal attention a small community expects — protecting your home, working efficiently, and keeping pricing clear from the first estimate to the final box.",
    ],
    neighborhoods: ["Colonial Club area", "Hickory Avenue", "Ridgewood", "Elmwood edge"],
    landmarks: ["Mississippi River levee", "Colonial Golf & Country Club", "Hickory Avenue", "Soniat Playground"],
    faqs: [
      { q: "Do you serve smaller Jefferson Parish communities like Harahan?", a: "Absolutely. Harahan is well within our service area, and we move families there regularly with the same care we bring across the metro." },
      { q: "Can you handle a full-home move in Harahan?", a: "Yes — from packing to loading, transport, and placement, we handle full residential moves of any size in Harahan." },
    ],
    nearby: ["river-ridge", "elmwood", "metairie"],
    heroImage: "/brand/photos/svc-residential.jpg",
  },
  {
    slug: "jefferson",
    name: "Jefferson",
    region: "Jefferson Parish",
    metaTitle: "Jefferson, LA Movers | Southern Magnolia Movers",
    metaDescription:
      "Movers in Jefferson, LA — the riverside community along Jefferson Highway near Ochsner. Homes and businesses moved with care. Request a free estimate.",
    h1: "Moving Company in Jefferson, LA",
    intro: [
      "The community of Jefferson runs along the river between New Orleans and Metairie, anchored by the Jefferson Highway corridor and the Ochsner medical campus. It's a busy, convenient location — and a familiar one for our crews.",
      "Whether you're moving a family home in Old Jefferson or a small business near the highway, we bring efficient, careful service and pricing you can count on.",
    ],
    neighborhoods: ["Old Jefferson", "Shrewsbury", "Harlem", "Jefferson Highway corridor"],
    landmarks: ["Ochsner Medical Center", "Jefferson Highway", "Mississippi River levee", "Clearview area"],
    faqs: [
      { q: "Do you move healthcare workers relocating near Ochsner?", a: "Frequently. Jefferson is a convenient base near the Ochsner campus, and we can coordinate timing around demanding work schedules." },
      { q: "Can you handle both homes and small businesses in Jefferson?", a: "Yes. We move residential homes and small commercial spaces throughout the Jefferson area." },
    ],
    nearby: ["elmwood", "harahan", "metairie"],
    heroImage: "/brand/photos/svc-commercial.jpg",
  },
  {
    slug: "elmwood",
    name: "Elmwood",
    region: "Jefferson Parish",
    metaTitle: "Elmwood Movers (Jefferson Parish) | Southern Magnolia Movers",
    metaDescription:
      "Elmwood movers for offices, retail & homes near the Elmwood business district. Commercial moves that minimize downtime — request a free estimate.",
    h1: "Moving Company in Elmwood",
    intro: [
      "Elmwood is Jefferson Parish's commercial heart — a dense mix of offices, retail, studios, and business parks just off the river. It's where a lot of our commercial and office moves happen.",
      "We plan Elmwood business relocations around your operating hours, including evenings and weekends, so your team keeps working while we handle desks, equipment, and inventory with care.",
    ],
    neighborhoods: ["Elmwood Business Park", "Citrus", "Harahan edge", "Riverside"],
    landmarks: ["Elmwood Shopping Center", "Elmwood Business Park", "Mississippi River levee"],
    faqs: [
      { q: "Do you handle office and commercial moves in Elmwood?", a: "Yes — Elmwood is a commercial hub, and we regularly move offices, retail spaces, and business parks there with minimal downtime." },
      { q: "Can you move after hours to avoid disrupting our business?", a: "We can. Evening and weekend commercial moves are common in Elmwood so your operations aren't interrupted." },
    ],
    nearby: ["harahan", "jefferson", "metairie"],
    heroImage: "/brand/photos/svc-commercial.jpg",
  },
  {
    slug: "river-ridge",
    name: "River Ridge",
    region: "Jefferson Parish",
    metaTitle: "River Ridge Movers | Southern Magnolia Movers",
    metaDescription:
      "River Ridge movers for this quiet riverside neighborhood in Jefferson Parish. Established family homes moved with care and clear pricing — free estimate.",
    h1: "Moving Company in River Ridge",
    intro: [
      "River Ridge is a peaceful, well-kept residential community along the Mississippi in Jefferson Parish, neighboring Harahan and just upriver from the airport. Its mature streets and established homes are a pleasure to move.",
      "Our crews give River Ridge families the same careful, personal attention we're known for — protecting your home, packing with quality materials, and delivering everything exactly where it belongs.",
    ],
    neighborhoods: ["Colonial Club area", "Ridgewood", "Jefferson Highway corridor", "Harahan edge"],
    landmarks: ["Mississippi River levee", "Colonial Golf & Country Club", "Jefferson Highway"],
    faqs: [
      { q: "Is River Ridge within your service area?", a: "Yes. River Ridge is a regular part of our Jefferson Parish service area, and we move families there throughout the year." },
      { q: "Do you offer packing for River Ridge homes?", a: "We do — full or partial packing is available, so you can hand off as much of the work as you'd like." },
    ],
    nearby: ["harahan", "kenner", "jefferson"],
    heroImage: "/brand/photos/svc-packing.jpg",
  },
];

export const CITY_SLUGS = CITIES.map((c) => c.slug);
export const FEATURED_CITIES = CITIES.filter((c) => c.featured);

export function getCity(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}
