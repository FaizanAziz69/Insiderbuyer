import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/cookies", {
  title: "Cookie Policy | Insider Buying",
  description:
    "The cookies and similar technologies Insider Buying uses, what they do, and how you can control them.",
});

const SECTIONS: LegalSection[] = [
  {
    h: "What cookies are",
    p: "Cookies are small text files stored by your browser when you visit a site. We also use similar technologies such as local storage. They let the site remember you between pages and visits.",
  },
  {
    h: "Essential cookies",
    p: "These keep you signed in, maintain your session and remember security-related state. The site cannot function properly without them, so they cannot be switched off from within the service.",
  },
  {
    h: "Preference cookies",
    p: "These remember choices you make — such as dismissed notices, display preferences and items on your watchlist — so the site behaves consistently for you.",
  },
  {
    h: "Analytics cookies",
    p: "We use analytics tools to understand how the site is used in aggregate — which pages are visited, which features are used and how visitors move through the site. This helps us improve the product. Analytics data is not used to identify you personally.",
  },
  {
    h: "Managing cookies",
    p: "You can control and delete cookies through your browser settings, including blocking them entirely. If you block essential cookies, parts of the site — such as signing in and premium access — may stop working.",
  },
  {
    h: "Changes & contact",
    p: "We may update this policy as our use of cookies changes; the date above reflects the latest revision. Questions can be sent to admin@insiderbuying.com.",
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookie Policy"
      intro="The cookies and similar technologies we use, and your choices."
      updated="August 17, 2026"
      sections={SECTIONS}
    />
  );
}
