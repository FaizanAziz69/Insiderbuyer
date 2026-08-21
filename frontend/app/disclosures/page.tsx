import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/disclosures", {
  title: "Disclosures | Insider Buying",
  description:
    "Advertising, affiliate, sponsored-content and data-source disclosures for Insider Buying.",
});

const SECTIONS: LegalSection[] = [
  {
    h: "Not a registered adviser",
    p: "Insider Buying is a financial data and media service. We are not a registered investment adviser, broker-dealer or financial planner, and nothing on the site constitutes personalized investment advice or a recommendation to buy or sell any security. See our Disclaimer for full details.",
  },
  {
    h: "Advertising & affiliate relationships",
    p: "We may display advertising and may earn compensation through affiliate or partner arrangements when you click certain links or sign up for third-party services. Such relationships never influence our data, the Insider Score or our rankings, which are computed from public filings by fixed methodology.",
  },
  {
    h: "Sponsored content",
    p: "Sponsored articles and advertorials, where present, are clearly labeled as such. Issuers do not pay to be included in — or excluded from — our scores, rankings or stock lists.",
  },
  {
    h: "Data sources",
    p: "Core insider data is parsed directly from SEC EDGAR (Form 4 filings) and other official public sources, supplemented by third-party market-data providers. Data may be delayed, incomplete or restated by the source; we present it as received and correct errors when identified. The Insider Score is a proprietary, opinion-based measure derived from this public data.",
  },
  {
    h: "Positions",
    p: "Contributors and staff may hold positions in securities mentioned on the site. Because our scores and rankings are generated from public filings by fixed methodology, personal holdings have no influence on them.",
  },
  {
    h: "Contact",
    p: "Questions about these disclosures can be sent to info@insiderbuying.com.",
  },
];

export default function DisclosuresPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Disclosures"
      intro="Advertising, affiliate, sponsored-content and data-source disclosures."
      updated="August 17, 2026"
      sections={SECTIONS}
    />
  );
}
