import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/terms", {
  title: "Terms of Service | Insider Buying",
  description:
    "The terms that govern your use of Insider Buying, including accounts, subscriptions, acceptable use and disclaimers.",
});

const SECTIONS: LegalSection[] = [
  {
    h: "Acceptance of these terms",
    p: "By accessing or using Insider Buying, you agree to be bound by these Terms of Service and our Privacy Policy and Disclaimer. If you do not agree, do not use the service. You must be at least 18 years old to create an account.",
  },
  {
    h: "The service",
    p: "Insider Buying aggregates and analyzes publicly available financial data — including SEC Form 4 filings, congressional trade disclosures and market data — and presents scores, rankings, articles and tools derived from it. The service is provided for informational and educational purposes only and is not investment advice. See our Disclaimer for important limitations.",
  },
  {
    h: "Accounts",
    p: "You are responsible for your account credentials and for all activity under your account. Provide accurate information and keep it up to date. We may suspend or terminate accounts that violate these terms or abuse the service.",
  },
  {
    h: "Subscriptions & billing",
    p: "Premium access is sold as a subscription billed in advance through our payment processor, Stripe. Subscriptions renew automatically at the end of each billing period unless cancelled beforehand. You can cancel at any time, effective at the end of the current period; fees already paid are non-refundable except where required by law. Prices may change with notice before your next renewal.",
  },
  {
    h: "Acceptable use",
    p: "You may not scrape, bulk-download, resell or redistribute our data, scores or content; circumvent subscription or access controls; interfere with the operation of the service; or use it for any unlawful purpose. Automated access requires our prior written permission.",
  },
  {
    h: "Intellectual property",
    p: "The Insider Score, site content, design and software are owned by Insider Buying or its licensors and are protected by intellectual-property laws. Underlying public filings remain public; our analysis, presentation and derived scores are ours. You receive a personal, non-exclusive, non-transferable licence to use the service.",
  },
  {
    h: "Disclaimers & limitation of liability",
    p: "The service is provided “as is” without warranties of any kind. Nothing on the site is investment, financial, legal or tax advice, and we are not a broker-dealer or investment adviser. To the maximum extent permitted by law, Insider Buying will not be liable for any indirect, incidental or consequential damages, or for trading losses arising from use of, or reliance on, the service; our total liability for any claim is limited to the amount you paid us in the twelve months before the claim arose.",
  },
  {
    h: "Termination",
    p: "You may stop using the service at any time. We may suspend or terminate access for breach of these terms. Sections that by their nature should survive termination (including intellectual property, disclaimers and limitation of liability) survive.",
  },
  {
    h: "Changes to these terms",
    p: "We may update these terms from time to time. Material changes will be reflected by updating the date at the top of this page, and continued use of the service after changes take effect constitutes acceptance.",
  },
  {
    h: "Contact",
    p: "Questions about these terms can be sent to info@insiderbuying.com.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="The terms that govern your use of Insider Buying."
      updated="August 17, 2026"
      sections={SECTIONS}
    />
  );
}
