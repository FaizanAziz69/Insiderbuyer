"use client";
import { usePathname } from "next/navigation";
import { TopHeader } from "./TopHeader";
import { AuthPromptHost } from "@/components/AuthPromptHost";
import { Footer } from "./Footer";
import { TopTickerBar } from "./TopTickerBar";
// import { ChatWidget } from "./chat/ChatWidget"; // hidden for now
import { PREMIUM_UNLOCKED } from "@/lib/premium";
import { InsiderActivityToast } from "@/components/home/InsiderActivityToast";
import { useBarePage } from "@/lib/use-bare-page";
import { VisualizerSwitcher } from "@/components/visualizers/VisualizerSwitcher";

/**
 * Standalone funnel pages that render without the site chrome.
 *
 * Path matching alone is not enough for the B2B site: on
 * press.insiderbuying.com nginx maps the host root onto /press, so the
 * browser's path is "/" and this check never fired — the page came up wearing
 * the consumer nav, ticker and toast. The route's own layout marks itself
 * instead (data-bare-page) and the chrome hides itself in CSS, which works on
 * both the subdomain and insiderbuying.com/press without making every page in
 * the app dynamic just to read a Host header.
 */
const BARE_ROUTES = [
  "/insider-report",
  // Round-2 brief, Section 2: isolated conversion pages — no header, no
  // footer, no navigation.
  "/top-picks-report",
  "/thank-you-report",
  // Round-2 brief, Section 4: the B2B site is a separate experience.
  "/press",
  "/campaigns",
  // Phase 5 of the visualizer brief: embeds are the same page in someone
  // else's iframe, so the consumer chrome has to come off.
  "/visualizers/embed",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = useBarePage();
  // Every visualizer, including the two bubble maps that predate the suite.
  // Not the hub itself — it already lists them all — and not the embeds,
  // which are bare by definition.
  const isVisualizer =
    !!pathname &&
    (pathname === "/bubbles" ||
      pathname === "/congress-bubbles" ||
      (pathname.startsWith("/visualizers/") &&
        !pathname.startsWith("/visualizers/embed")));
  if (BARE_ROUTES.some((r) => pathname?.startsWith(r))) {
    return <>{children}</>;
  }
  return (
    <div
      className={`min-h-screen flex flex-col${PREMIUM_UNLOCKED ? " premium-unlocked" : ""}`}
    >
      <div data-app-chrome>
        <TopTickerBar />
      </div>
      {/* data-app-sticky lets pages that scroll to an in-page section measure
          this header's height and offset by it, so the target lands below the
          header instead of underneath it. z-[35]: above /premium's sticky
          founding-offer strip (30), which at z-20 rode OVER the nav and its
          open dropdowns on scroll; below the activity toast (40) and modals
          (50). */}
      {/* Inside data-app-sticky on purpose: the two bubble maps size their
          canvas to `innerHeight - stickyHeight`, so a bar added anywhere else
          would push the field off the bottom of the screen by its own height.
          Here the measurement absorbs it and the map shrinks to fit.
          George 2026-09-14: from a visualizer you must be able to "switch
          visualizers from there". */}
      <div data-app-chrome data-app-sticky className="sticky top-0 z-[35]">
        <TopHeader />
        <AuthPromptHost />
        {isVisualizer && (
          <div
            className="px-6 sm:px-10 lg:px-16 xl:px-24"
            style={{ background: "var(--bg-3)", borderBottom: "1px solid var(--border)" }}
          >
            <div className="max-w-[1640px] mx-auto">
              <VisualizerSwitcher />
            </div>
          </div>
        )}
      </div>
      <main
        className={
          // The bubbles map is a full-bleed app view: nav above, footer below,
          // no gutter — its canvas sizes itself to the main element.
          (pathname?.startsWith("/bubbles") || pathname?.startsWith("/congress-bubbles"))
            ? "flex-1 w-full"
            : "flex-1 px-6 sm:px-10 lg:px-16 xl:px-24 py-6 sm:py-8 max-w-[1640px] mx-auto w-full"
        }
      >
        {children}
      </main>
      <div data-app-chrome>
        <Footer />
      </div>
      {/* <ChatWidget /> */}{/* "Ask the Insider" chat button — hidden for now */}
      {/* Live insider-buy notification — appears ~10s after landing, any page.
          Not mounted on bare pages: CSS only hides it, and its cha-ching was
          audible on press.insiderbuying.com (George, 2026-09-01). */}
      {!bare && (
        <div data-app-chrome>
          <InsiderActivityToast />
        </div>
      )}
    </div>
  );
}
