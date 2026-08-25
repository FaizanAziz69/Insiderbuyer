"use client";
import { usePathname } from "next/navigation";
import { TopHeader } from "./TopHeader";
import { Footer } from "./Footer";
import { TopTickerBar } from "./TopTickerBar";
// import { ChatWidget } from "./chat/ChatWidget"; // hidden for now
import { PREMIUM_UNLOCKED } from "@/lib/premium";
import { InsiderActivityToast } from "@/components/home/InsiderActivityToast";

/** Standalone funnel pages that render without the site chrome. */
const BARE_ROUTES = [
  "/insider-report",
  // Round-2 brief, Section 2: isolated conversion pages — no header, no
  // footer, no navigation.
  "/join",
  "/top-picks-report",
  "/thank-you-report",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.some((r) => pathname?.startsWith(r))) {
    return <>{children}</>;
  }
  return (
    <div
      className={`min-h-screen flex flex-col${PREMIUM_UNLOCKED ? " premium-unlocked" : ""}`}
    >
      <TopTickerBar />
      {/* data-app-sticky lets pages that scroll to an in-page section measure
          this header's height and offset by it, so the target lands below the
          header instead of underneath it. z-[35]: above /premium's sticky
          founding-offer strip (30), which at z-20 rode OVER the nav and its
          open dropdowns on scroll; below the activity toast (40) and modals
          (50). */}
      <div data-app-sticky className="sticky top-0 z-[35]">
        <TopHeader />
      </div>
      <main
        className={
          // The bubbles map is a full-bleed app view: nav above, footer below,
          // no gutter — its canvas sizes itself to the main element.
          pathname?.startsWith("/bubbles")
            ? "flex-1 w-full"
            : "flex-1 px-6 sm:px-10 lg:px-16 xl:px-24 py-6 sm:py-8 max-w-[1640px] mx-auto w-full"
        }
      >
        {children}
      </main>
      <Footer />
      {/* <ChatWidget /> */}{/* "Ask the Insider" chat button — hidden for now */}
      {/* Live insider-buy notification — appears ~10s after landing, any page */}
      <InsiderActivityToast />
    </div>
  );
}
