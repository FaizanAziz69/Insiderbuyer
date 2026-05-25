"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { LiveTicker } from "./LiveTicker";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="sticky top-0 z-20">
          <TopHeader onMenuOpen={() => setOpen(true)} />
          <LiveTicker />
        </div>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
