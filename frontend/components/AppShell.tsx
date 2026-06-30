"use client";
import { TopHeader } from "./TopHeader";
import { Footer } from "./Footer";
import { TopTickerBar } from "./TopTickerBar";
import { ChatWidget } from "./chat/ChatWidget";
import { PREMIUM_UNLOCKED } from "@/lib/premium";

export function AppShell({ children }: { children: React.ReactNode }) {
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
      <ChatWidget />
    </div>
  );
}
