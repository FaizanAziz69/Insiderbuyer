"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, LogIn, Sparkles, User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LoginModal } from "./LoginModal";
import { Logo } from "./Logo";

export function TopHeader() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <header
        className="relative h-24 border-b flex items-center px-3 sm:px-4 lg:px-6"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        <Link
          href="/"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <Logo size="md" />
        </Link>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/alerts"
            className="hidden sm:inline-flex h-9 w-9 rounded-md hover:bg-[var(--bg-3)] items-center justify-center relative"
            aria-label="Alerts"
          >
            <Bell className="h-4 w-4 text-soft" />
            <span
              className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--bad)" }}
            />
          </Link>
          <Link
            href="/premium"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              boxShadow: "0 4px 12px rgba(0,102,255,0.25)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Subscribe
          </Link>
          <button
            onClick={() => setLoginOpen(true)}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-semibold border"
            style={{
              borderColor: "var(--border-strong)",
              color: "var(--text-soft)",
              background: "var(--bg-2)",
            }}
          >
            <LogIn className="h-3.5 w-3.5" />
            Log in
          </button>
          <ThemeToggle />
          <button
            onClick={() => setLoginOpen(true)}
            className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-[var(--bg-3)]"
            style={{ borderColor: "var(--border-strong)", background: "var(--bg-2)" }}
            aria-label="Profile"
          >
            <User className="h-4 w-4 text-soft" />
          </button>
        </div>
      </header>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
