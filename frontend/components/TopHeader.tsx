"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, LogIn, Menu, Sparkles, User, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LoginModal } from "./LoginModal";
import { Logo } from "./Logo";

const NAV: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Markets", href: "/markets" },
  { label: "Stocks", href: "/companies" },
  { label: "Funds", href: "/funds" },
  { label: "Economy", href: "/economy" },
  { label: "News", href: "/news" },
  { label: "Ideas", href: "/lists" },
];

export function TopHeader() {
  const pathname = usePathname() || "/";
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      <header
        className="h-16 border-b flex items-center justify-between px-3 sm:px-4 lg:px-6 gap-3"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <Logo size="md" />
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-1.5 rounded-md text-[13px] font-semibold transition whitespace-nowrap"
              style={{
                background: isActive(n.href) ? "var(--accent-soft)" : "transparent",
                color: isActive(n.href) ? "var(--accent)" : "var(--text-soft)",
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden h-9 w-9 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
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
            Premium
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

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="absolute top-0 right-0 bottom-0 w-72 border-l p-5"
            style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold">Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="h-8 w-8 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-2.5 rounded-md text-sm font-semibold"
                  style={{
                    background: isActive(n.href) ? "var(--accent-soft)" : "transparent",
                    color: isActive(n.href) ? "var(--accent)" : "var(--text-soft)",
                  }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
