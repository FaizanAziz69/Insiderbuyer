import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Figtree, Libre_Franklin } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { PostHogProvider } from "@/components/PostHogProvider";
import { FunnelPopups } from "@/components/funnel/FunnelPopups";
import { PremiumProvider } from "@/components/premium/PremiumContext";
import { AuthProvider } from "@/lib/auth";
import { OG_IMAGE, seoEntry } from "@/lib/seo-meta";
import { AppleSplash } from "@/components/pwa/AppleSplash";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

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

const defaultTitle = home?.t ?? "InsiderBuying.com — Live SEC Form 4 + Congressional Trades";
const defaultDescription =
  home?.d ??
  "Track insider buys and sells in real-time. SEC Form 4 analysis reveals where smart money is accumulating.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://insiderbuying.com"),
  // Installable app (app/manifest.ts). iOS ignores most of the manifest, so
  // the standalone behaviour, home-screen title and touch icon come from
  // appleWebApp below and the launch images in <head>.
  manifest: "/manifest.webmanifest",
  applicationName: "InsiderBuying",
  appleWebApp: {
    capable: true,
    title: "InsiderBuying",
    // "black" — an OPAQUE status bar the web view starts BELOW.
    //
    // Was "black-translucent", which paints the page under the status bar and
    // only works if every top-of-screen element pads itself by
    // env(safe-area-inset-top). Nothing did: in the installed app the ticker
    // bar and header sat under the clock, and the nav drawer lost its "Menu"
    // row and search box entirely (George, 2026-09-03: "certain parts on site
    // at the top and the menu bar is not formatted correctly"). Safari was
    // fine throughout, which is why it only showed up once the app was
    // installed. "black" makes iOS reserve the strip, so nothing can be
    // clipped in any state — header, drawer, light theme or dark.
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
  icons: {
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  title: defaultTitle,
  description: defaultDescription,
  // Branded link previews (client 2026-08-22): every shared link shows the
  // logo card. Route-level metadata (pageMetadata / article layouts) can
  // override, but inherits this image unless it sets its own.
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    siteName: "InsiderBuying.com",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Fills the notch/home-indicator area when installed, so the standalone app
  // does not sit in a letterbox.
  viewportFit: "cover",
  // Matches the manifest so the Android task-switcher and the iOS status bar
  // carry the brand colour instead of browser default.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#005882" },
    { media: "(prefers-color-scheme: dark)", color: "#070d1f" },
  ],
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
        <AppleSplash />
      </head>
      <body className="antialiased">
        <GoogleAnalytics />
        <RegisterServiceWorker />
        <PostHogProvider />
        {/* Auth first: PremiumProvider derives the entitlement from the
            signed-in user's Stripe subscription. */}
        <AuthProvider>
          <PremiumProvider>
            <AppShell>{children}</AppShell>
            <FunnelPopups />
            <InstallPrompt />
          </PremiumProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
