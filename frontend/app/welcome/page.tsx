import type { Metadata } from "next";
import WelcomeClient from "./PageClient";

export const metadata: Metadata = {
  title: "Welcome to Insider Buying | InsiderBuying.com",
  description: "Your free report is on its way. Here is your first message from Insider Buying.",
  robots: { index: false, follow: false },
};

/**
 * Thank-you page after the free-report popup (George 2026-09-21): "add a
 * thank you page after subscribing with our first welcome to insider buying
 * message (same email we send first), followed by CTA that says 'get our
 * penny stock spotlight -- one stock under $100M.'"
 */
export default function WelcomePage() {
  return <WelcomeClient />;
}
