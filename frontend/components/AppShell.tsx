"use client";
import { usePathname } from "next/navigation";
import { TopHeader } from "./TopHeader";
import { Footer } from "./Footer";
import { TopTickerBar } from "./TopTickerBar";
// import { ChatWidget } from "./chat/ChatWidget"; // hidden for now
import { PREMIUM_UNLOCKED } from "@/lib/premium";
import { InsiderActivityToast } from "@/components/home/InsiderActivityToast";

/** Standalone funnel pages that render without the site chrome. */
const BARE_ROUTES = ["/insider-report"];

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
      <div className="sticky top-0 z-20">
        <TopHeader />
      </div>
      <main className="flex-1 px-6 sm:px-10 lg:px-16 xl:px-24 py-6 sm:py-8 max-w-[1640px] mx-auto w-full">
        {children}
      </main>
      <Footer />
      {/* <ChatWidget /> */}{/* "Ask the Insider" chat button — hidden for now */}
      {/* Live insider-buy notification — appears ~10s after landing, any page */}
      <InsiderActivityToast />
    </div>
  );
}
