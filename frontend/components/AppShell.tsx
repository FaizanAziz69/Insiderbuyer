"use client";
import { TopHeader } from "./TopHeader";
import { Footer } from "./Footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-20">
        <TopHeader />
      </div>
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px] mx-auto w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}
