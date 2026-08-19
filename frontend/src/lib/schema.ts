import { SITE_URL } from "./siteUrl";
import { BRAND } from "./brand";
import type { Faq } from "./faqs";
import type { Service } from "./services";
import type { City } from "./cities";

const TELEPHONE = "+1-504-559-6340";

const AREAS = [
  "New Orleans",
  "Metairie",
  "Kenner",
  "Covington",
  "Mandeville",
  "Slidell",
  "Hammond",
  "Gretna",
  "Laplace",
  "Houma",
];

const areaServed = AREAS.map((a) => ({ "@type": "City", name: `${a}, LA` }));

export function movingCompanySchema() {
  return {
    "@context": "https://schema.org",
    "@type": "MovingCompany",
    "@id": `${SITE_URL}/#business`,
    name: BRAND.name,
    url: SITE_URL,
    telephone: TELEPHONE,
    email: BRAND.email,
    image: `${SITE_URL}/brand/og-share.jpg`,
    logo: `${SITE_URL}/brand/logo-official.jpg`,
    description:
      "Professional residential and commercial moving throughout New Orleans and Southeast Louisiana.",
    areaServed,
    priceRange: "$$",
    slogan: BRAND.taglinePrimary,
  };
}

export function faqSchema(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

export function serviceSchema(s: Service) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    serviceType: s.name,
    description: s.metaDescription,
    url: `${SITE_URL}/services/${s.slug}`,
    provider: {
      "@type": "MovingCompany",
      "@id": `${SITE_URL}/#business`,
      name: BRAND.name,
      url: SITE_URL,
      telephone: TELEPHONE,
    },
    areaServed,
  };
}

export function cityServiceSchema(c: City) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Moving Services in ${c.name}, LA`,
    serviceType: "Moving company",
    description: c.metaDescription,
    url: `${SITE_URL}/service-areas/${c.slug}`,
    provider: {
      "@type": "MovingCompany",
      "@id": `${SITE_URL}/#business`,
      name: BRAND.name,
      url: SITE_URL,
      telephone: TELEPHONE,
    },
    areaServed: {
      "@type": "City",
      name: `${c.name}, LA`,
    },
  };
}
