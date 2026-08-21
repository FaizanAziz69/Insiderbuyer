import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/privacy", {
  title: "Privacy Policy | Insider Buying",
  description:
    "How Insider Buying collects, uses and protects your personal information, including account, payment and analytics data.",
});

const SECTIONS: LegalSection[] = [
  {
    h: "Information we collect",
    p: "When you create an account or subscribe, we collect the information you provide — typically your name, email address and password. If you sign up for alerts, newsletters or special offers, we collect the email address you submit. We also automatically collect standard technical information such as your IP address, browser type, device information and the pages you visit.",
  },
  {
    h: "Payments",
    p: "Subscription payments are processed by Stripe, our payment processor. Your card details are transmitted directly to Stripe and are never stored on our servers. We receive only limited billing information, such as the subscription status and the last four digits of your card, needed to manage your account. Stripe's handling of your data is governed by its own privacy policy.",
  },
  {
    h: "How we use your information",
    p: "We use your information to provide and improve the service: operating your account and watchlists, delivering the alerts and emails you request, processing subscriptions, understanding how the site is used so we can improve it, and communicating with you about your account or changes to the service.",
  },
  {
    h: "Analytics & cookies",
    p: "We use analytics tools to understand aggregate usage of the site (pages visited, features used, approximate location derived from IP). We use cookies and similar technologies for sign-in sessions, preferences and analytics. See our Cookie Policy for details and choices.",
  },
  {
    h: "Sharing",
    p: "We do not sell your personal information. We share it only with service providers who process it on our behalf — such as payment processing (Stripe), email delivery and analytics providers — and where required by law or to protect our rights. These providers may only use your information to provide services to us.",
  },
  {
    h: "Retention",
    p: "We keep account information for as long as your account is active and as needed to comply with legal obligations, resolve disputes and enforce agreements. You can request deletion of your account and associated personal data at any time.",
  },
  {
    h: "Your rights",
    p: "Depending on where you live, you may have rights to access, correct, export or delete your personal information, and to object to or restrict certain processing. To exercise any of these rights, contact us at info@insiderbuying.com and we will respond within a reasonable timeframe.",
  },
  {
    h: "Children",
    p: "The service is not directed to children under 18, and we do not knowingly collect personal information from them. If you believe a child has provided us with personal information, contact us and we will delete it.",
  },
  {
    h: "Changes to this policy",
    p: "We may update this policy from time to time. Material changes will be reflected by updating the date at the top of this page, and where appropriate we will notify you by email or a notice on the site.",
  },
  {
    h: "Contact",
    p: "Questions about this policy or your data can be sent to info@insiderbuying.com.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="How Insider Buying collects, uses and protects your information."
      updated="August 17, 2026"
      sections={SECTIONS}
    />
  );
}
