import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Hero } from "@/components/marketing/Hero";
import { TrustBar } from "@/components/marketing/TrustBar";
import { WhyChooseUs } from "@/components/marketing/WhyChooseUs";
import { ServicesGrid } from "@/components/marketing/ServicesGrid";
import { ProcessTimeline } from "@/components/marketing/ProcessTimeline";
import { AreasWeServe } from "@/components/marketing/AreasWeServe";
import { FAQ } from "@/components/marketing/FAQ";
import { EstimateSection } from "@/components/marketing/EstimateSection";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { movingCompanySchema, faqSchema } from "@/lib/schema";
import { HOME_FAQS } from "@/lib/faqs";

export const metadata: Metadata = {
  title: "Southern Magnolia Movers — New Orleans Residential & Commercial Movers",
  description:
    "Family-owned residential and commercial moving throughout New Orleans and Southeast Louisiana. Get your free estimate today.",
  keywords: [
    "New Orleans movers",
    "moving company New Orleans",
    "residential movers",
    "commercial movers",
    "Southeast Louisiana moving",
    "packing services",
    "long distance movers Louisiana",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Southern Magnolia Movers — Moving You Forward.",
    description:
      "Premium residential & commercial moving across New Orleans and Southeast Louisiana. Careful crews, clear pricing, local pride.",
    url: "/",
    type: "website",
    locale: "en_US",
    siteName: "Southern Magnolia Movers",
    images: [
      {
        url: "/brand/og-share.jpg",
        width: 1200,
        height: 630,
        alt: "Southern Magnolia Movers — Moving You Forward.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Southern Magnolia Movers — Moving You Forward.",
    description:
      "Premium residential & commercial moving across New Orleans and Southeast Louisiana. Careful crews, clear pricing, local pride.",
    images: ["/brand/og-share.jpg"],
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream font-sans text-navy antialiased">
      <JsonLd data={[movingCompanySchema(), faqSchema(HOME_FAQS)]} />
      <SiteHeader />
      <main>
        <Hero />
        <TrustBar />
        <WhyChooseUs />
        <ServicesGrid />
        <ProcessTimeline />
        <AreasWeServe />
        <FAQ />
        <EstimateSection />
      </main>
      <SiteFooter />
    </div>
  );
}
