"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, LogIn, Menu, Sparkles, User, X, ChevronRight } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LoginModal } from "./LoginModal";
import { Logo } from "./Logo";
import { MegaDropdown } from "./nav/MegaDropdown";
import { NAV_GROUPS } from "@/lib/nav-config";

export function TopHeader() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header
        className="h-20 flex items-center px-3 sm:px-4 lg:px-6 gap-4"
        style={{
          background: "var(--brand-surface)",
          color: "#ffffff",
          borderBottom: "1px solid var(--brand-surface-border)",
        }}
      >
        {/* LEFT — logo */}
        <Link href="/" className="flex items-center flex-shrink-0" style={{ color: "#ffffff" }}>
          <Logo size="md" tone="light" />
        </Link>

        {/* CENTER — mega-dropdown nav (desktop only) */}
        <nav className="hidden lg:flex items-center gap-1 ml-6">
          {NAV_GROUPS.map((g) => (
            <MegaDropdown key={g.label} group={g} />
          ))}
        </nav>

        {/* RIGHT — actions */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden h-9 w-9 rounded-md flex items-center justify-center"
            style={{ color: "#ffffff", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" style={{ color: "#ffffff" }} />
          </button>
          <Link
            href="/alerts"
            className="hidden sm:inline-flex h-9 w-9 rounded-md items-center justify-center relative"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-label="Alerts"
          >
            <Bell className="h-4 w-4" style={{ color: "#ffffff" }} />
            <span
              className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--gold)" }}
            />
          </Link>
          <Link
            href="/premium"
            className="hidden sm:inline-flex items-center justify-center gap-1.5 px-5 h-10 rounded-md text-[14px] font-semibold"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(0,88,130,0.28)",
              minWidth: 120,
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "#ffffff" }} />
            <span style={{ color: "#ffffff" }}>Subscribe</span>
          </Link>
          <button
            onClick={() => setLoginOpen(true)}
            className="hidden sm:inline-flex items-center justify-center gap-1.5 px-5 h-10 rounded-md text-[14px] font-semibold"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(0,88,130,0.28)",
              border: "none",
              minWidth: 120,
              cursor: "pointer",
            }}
          >
            <LogIn className="h-4 w-4" style={{ color: "#ffffff" }} />
            <span style={{ color: "#ffffff" }}>Log in</span>
          </button>
          <div style={{ color: "#ffffff" }}>
            <ThemeToggle />
          </div>
          <button
            onClick={() => setLoginOpen(true)}
            className="h-9 w-9 rounded-full flex items-center justify-center"
            style={{
              border: "1px solid rgba(255,255,255,0.45)",
              background: "transparent",
              color: "#ffffff",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-label="Profile"
          >
            <User className="h-4 w-4" style={{ color: "#ffffff" }} />
          </button>
        </div>
      </header>

      {/* Mobile menu — accordion fallback for nav */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="absolute top-0 right-0 bottom-0 w-[88%] max-w-sm border-l p-5 overflow-y-auto"
            style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold text-lg">Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="h-9 w-9 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {NAV_GROUPS.map((g) => (
              <div key={g.label} className="mb-6">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent mb-3">
                  {g.label}
                </div>
                <ul className="space-y-1">
                  {g.columns.flatMap((col) => col.links).map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-[var(--accent-soft)]"
                      >
                        <span className="text-[14px] font-semibold text-soft">
                          {link.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
