import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Hero } from "@/components/marketing/Hero";
import { TrustBar } from "@/components/marketing/TrustBar";
import { WhyChooseUs } from "@/components/marketing/WhyChooseUs";
import { ServicesGrid } from "@/components/marketing/ServicesGrid";
import { ProcessTimeline } from "@/components/marketing/ProcessTimeline";
import { Testimonials } from "@/components/marketing/Testimonials";
import { FAQ } from "@/components/marketing/FAQ";
import { EstimateSection } from "@/components/marketing/EstimateSection";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata: Metadata = {
  title: "Southern Magnolia Movers — New Orleans Residential & Commercial Movers",
  description:
    "Professional residential and commercial moving throughout New Orleans and Southeast Louisiana. Licensed, insured, family-owned. Get your free estimate today.",
  keywords: [
    "New Orleans movers",
    "moving company New Orleans",
    "residential movers",
    "commercial movers",
    "Southeast Louisiana moving",
    "packing services",
    "long distance movers Louisiana",
  ],
  openGraph: {
    title: "Southern Magnolia Movers — Moving You Forward.",
    description:
      "Premium residential & commercial moving across New Orleans and Southeast Louisiana. Careful crews, clear pricing, local pride.",
    type: "website",
    locale: "en_US",
    siteName: "Southern Magnolia Movers",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream font-sans text-navy antialiased">
      <SiteHeader />
      <main>
        <Hero />
        <TrustBar />
        <WhyChooseUs />
        <ServicesGrid />
        <ProcessTimeline />
        <Testimonials />
        <FAQ />
        <EstimateSection />
      </main>
      <SiteFooter />
    </div>
  );
}
