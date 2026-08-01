import type { Metadata } from "next";
import { LegalShell, LegalSection } from "@/components/marketing/LegalShell";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of Service — Southern Magnolia Movers",
  description:
    "The terms that govern your use of the Southern Magnolia Movers website and estimate-request feature.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" effectiveDate="August 1, 2026">
      <p className="text-base leading-relaxed text-navy/70">
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Southern Magnolia Movers
        website. By accessing or using this site, you agree to these Terms. If you do not agree, please
        do not use the site.
      </p>

      <LegalSection heading="Use of this website">
        <p>
          This website is provided for general informational purposes about our moving services and to
          let you request an estimate. Information on the site is offered in good faith but may change
          without notice.
        </p>
      </LegalSection>

      <LegalSection heading="Estimate requests are not binding bookings">
        <p>
          Submitting the estimate form is a request for information only. It does not create a
          contract, reserve a date, or guarantee that a move will be scheduled. A move is only
          confirmed once we agree on the details with you directly.
        </p>
      </LegalSection>

      <LegalSection heading="Pricing and scheduling require company confirmation">
        <p>
          Any prices, availability, or timeframes discussed on this site or in response to a request
          are estimates and are not final until confirmed by Southern Magnolia Movers. Final pricing
          and scheduling depend on the specifics of your move and our written or verbal confirmation.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use the site for any unlawful purpose or in violation of these Terms.</li>
          <li>Submit false, misleading, or another person&rsquo;s information without permission.</li>
          <li>
            Attempt to disrupt, damage, or gain unauthorized access to the site or its underlying
            systems.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          The content on this site, including text, logos, branding, images, and design, is owned by
          or licensed to Southern Magnolia Movers and is protected by applicable law. You may not copy,
          reproduce, or use it without our prior written permission.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party links">
        <p>
          The site may contain links to third-party websites or services. We do not control and are
          not responsible for the content, policies, or practices of those third parties. Visiting
          them is at your own risk.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>
          The site and its content are provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo;
          without warranties of any kind, whether express or implied, including fitness for a
          particular purpose and accuracy of information, to the fullest extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, Southern Magnolia Movers will not be liable for any
          indirect, incidental, or consequential damages arising from your use of, or inability to use,
          this website.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These Terms are governed by the laws of the State of Louisiana, without regard to its
          conflict-of-laws rules.
        </p>
      </LegalSection>

      <LegalSection heading="Contact us">
        <p>
          Questions about these Terms? Contact us at{" "}
          <a href={BRAND.emailHref} className="font-medium text-navy underline hover:text-gold-hover">
            {BRAND.email}
          </a>{" "}
          or{" "}
          <a href={BRAND.phoneHref} className="font-medium text-navy underline hover:text-gold-hover">
            {BRAND.phone}
          </a>
          , New Orleans, Louisiana.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
