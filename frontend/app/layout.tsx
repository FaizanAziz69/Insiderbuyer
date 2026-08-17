import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Figtree, Libre_Franklin } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { PostHogProvider } from "@/components/PostHogProvider";
import { SitePopups } from "@/components/SitePopups";
import { PremiumProvider } from "@/components/premium/PremiumContext";
import { AuthProvider } from "@/lib/auth";
import { seoEntry } from "@/lib/seo-meta";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-heading",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-figtree",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});


// Homepage copy from the SEO team's on-page optimization sheet; also the
// site-wide default for routes without their own metadata.
const home = seoEntry("/");

export const metadata: Metadata = {
  title: home?.t ?? "Insider Buying — Live SEC Form 4 + Congressional Trades",
  description:
    home?.d ??
    "Track insider buys and sells in real-time. SEC Form 4 analysis reveals where smart money is accumulating.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Stops iOS Safari from auto-zooming into sub-16px inputs and staying
  // zoomed (the "everything is zoomed in" bug after the opt-in modal).
  // Pinch-zoom still works — iOS ≥10 ignores maximumScale for user gestures.
  maximumScale: 1,
};

const themeScript = `
  (function(){
    try {
      var saved = localStorage.getItem('ib-theme');
      document.documentElement.setAttribute('data-theme', saved || 'light');
    } catch(e) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCondensed.variable} ${figtree.variable} ${libreFranklin.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <PostHogProvider />
        {/* Auth first: PremiumProvider derives the entitlement from the
            signed-in user's Stripe subscription. */}
        <AuthProvider>
          <PremiumProvider>
            <AppShell>{children}</AppShell>
            <SitePopups />
          </PremiumProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
