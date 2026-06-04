"use client";
import { TopHeader } from "./TopHeader";
import { Footer } from "./Footer";
import { TopTickerBar } from "./TopTickerBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopTickerBar />
      <div className="sticky top-0 z-20">
        <TopHeader />
      </div>
      <main className="flex-1 px-2 sm:px-3 lg:px-4 py-6 sm:py-8 max-w-[1640px] mx-auto w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}
