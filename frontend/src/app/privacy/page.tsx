import type { Metadata } from "next";
import { LegalShell, LegalSection } from "@/components/marketing/LegalShell";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy — Southern Magnolia Movers",
  description:
    "How Southern Magnolia Movers collects, uses, and protects the information you share when requesting a moving estimate.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" effectiveDate="August 1, 2026">
      <p className="text-base leading-relaxed text-navy/70">
        This Privacy Policy explains what information Southern Magnolia Movers (&ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects when you use our website or request a moving
        estimate, how we use that information, and the choices you have. By using this site, you agree
        to the practices described below.
      </p>

      <LegalSection heading="Information we collect through the estimate form">
        <p>
          When you submit our estimate request form, we collect the details you choose to provide,
          which typically include:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name.</li>
          <li>Your contact details, such as email address and/or phone number.</li>
          <li>
            Move information, such as the type of move and your preferred move date.
          </li>
        </ul>
        <p>
          We only ask for the information needed to respond to your request. Please do not send us
          sensitive personal information (for example, financial account numbers or government IDs)
          through the form.
        </p>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <p>We use the information you provide to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Respond to your estimate request and answer your questions.</li>
          <li>Prepare a quote and discuss availability, pricing, and scheduling.</li>
          <li>Contact you about your request by phone, text, or email.</li>
          <li>Operate, maintain, and improve our website and services.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not share it with third parties for
          their own marketing.
        </p>
      </LegalSection>

      <LegalSection heading="Service providers">
        <p>
          We use trusted third-party providers to help us run our website and manage estimate
          requests, including website hosting and secure data-storage infrastructure. These providers
          process information on our behalf and are expected to protect it and use it only to provide
          services to us.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We keep the information you submit for as long as needed to respond to your request, provide
          our services, and maintain reasonable business and recordkeeping needs. When it is no longer
          needed, we take steps to delete or anonymize it.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We use reasonable administrative and technical safeguards designed to protect the
          information you share with us. However, no method of transmission or storage is completely
          secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          You may contact us at any time to ask what information we hold about you, request that we
          correct or delete it, or ask us to stop contacting you. We will honor reasonable requests
          consistent with applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we will revise the effective
          date above. Continued use of the site after changes take effect means you accept the updated
          policy.
        </p>
      </LegalSection>

      <LegalSection heading="Contact us">
        <p>
          If you have questions about this policy or your information, contact us at{" "}
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
