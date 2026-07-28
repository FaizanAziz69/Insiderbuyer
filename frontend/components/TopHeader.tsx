"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  LogIn,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Star,
  User,
  X,
  ChevronRight,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LoginModal } from "./LoginModal";
import { Logo } from "./Logo";
import { MegaDropdown } from "./nav/MegaDropdown";
import { StockSearch } from "./nav/StockSearch";
import { NAV_GROUPS } from "@/lib/nav-config";
import { useAuth } from "@/lib/auth";

export function TopHeader() {
  const { user, signOut } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the account dropdown on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const initial = (user?.name?.trim()?.[0] || user?.email?.[0] || "U").toUpperCase();

  return (
    <>
      <header
        className="h-20"
        style={{
          background: "var(--brand-surface)",
          color: "#ffffff",
          borderBottom: "1px solid var(--brand-surface-border)",
        }}
      >
        {/* Inner container aligned with the main content (same max-width +
            gutters as <main>) so the logo lines up with where articles start. */}
        <div className="h-full w-full max-w-[1640px] mx-auto flex items-center gap-4 px-6 sm:px-10 lg:px-16 xl:px-24">
        {/* LEFT — logo */}
        <Link href="/" className="flex items-center flex-shrink-0" style={{ color: "#ffffff" }}>
          <Logo size="sm" tone="light" />
        </Link>

        {/* CENTER — mega-dropdown nav (desktop only) */}
        <nav className="hidden lg:flex items-center gap-1 ml-6">
          {NAV_GROUPS.map((g) => (
            <MegaDropdown key={g.label} group={g} />
          ))}
        </nav>

        {/* Ticker / company search */}
        <div className="hidden md:block ml-auto w-56 lg:w-72">
          <StockSearch />
        </div>

        {/* RIGHT — actions */}
        <div className="ml-auto md:ml-2 flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
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
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-5 h-9 sm:h-10 rounded-md text-[13px] sm:text-[14px] font-semibold whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(0,88,130,0.28)",
            }}
          >
            <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: "#ffffff" }} />
            <span style={{ color: "#ffffff" }}>Subscribe</span>
          </Link>
          {!user && (
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
          )}
          <div style={{ color: "#ffffff" }}>
            <ThemeToggle />
          </div>
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-bold"
                style={{
                  border: "1px solid rgba(255,255,255,0.45)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#ffffff",
                }}
                aria-label="Account menu"
                aria-expanded={menuOpen}
              >
                {initial}
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-60 rounded-lg overflow-hidden z-50"
                  style={{
                    background: "var(--bg-2)",
                    border: "1px solid var(--border-strong)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
                  }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    {user.name && (
                      <div className="text-[14px] font-bold truncate" style={{ color: "var(--text)" }}>
                        {user.name}
                      </div>
                    )}
                    <div className="text-[12px] text-mute truncate">{user.email}</div>
                  </div>
                  <nav className="py-1">
                    <Link
                      href="/watchlist"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium hover:bg-[var(--accent-soft)] transition"
                      style={{ color: "var(--text)" }}
                    >
                      <Star className="h-4 w-4 text-mute" /> Watchlist
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium hover:bg-[var(--accent-soft)] transition"
                      style={{ color: "var(--text)" }}
                    >
                      <Settings className="h-4 w-4 text-mute" /> Settings
                    </Link>
                    <button
                      onClick={() => {
                        signOut();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium hover:bg-[var(--accent-soft)] transition text-left"
                      style={{ color: "var(--bad)" }}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </nav>
                </div>
              )}
            </div>
          ) : (
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
              aria-label="Sign in"
            >
              <User className="h-4 w-4" style={{ color: "#ffffff" }} />
            </button>
          )}
        </div>
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
            <div className="mb-4">
              <StockSearch dark={false} onNavigate={() => setMobileOpen(false)} />
            </div>

            {/* Premium CTA — the only route to /premium on a phone. */}
            <Link
              href="/premium"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-lg text-[15px] font-bold mb-3"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(0,88,130,0.28)",
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "#ffffff" }} />
              Subscribe to Premium
            </Link>
            {!user && (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  setLoginOpen(true);
                }}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-lg text-[15px] font-bold mb-6"
                style={{
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                }}
              >
                <LogIn className="h-4 w-4" /> Log in
              </button>
            )}
            {user && <div className="mb-6" />}
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
                        <span className="text-[14px] font-semibold text-soft inline-flex items-center gap-1.5">
                          {link.label}
                          {/* Same badge chips as the desktop mega-dropdown */}
                          {link.badge === "new" && (
                            <span
                              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "var(--good-soft)", color: "var(--good)" }}
                            >
                              New
                            </span>
                          )}
                          {link.badge === "popular" && (
                            <span
                              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                              style={{
                                background: "color-mix(in srgb, var(--warn) 18%, transparent)",
                                color: "var(--warn)",
                              }}
                            >
                              Popular
                            </span>
                          )}
                          {link.badge === "premium" && (
                            <span
                              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "var(--premium)", color: "var(--premium-ink)" }}
                            >
                              Premium
                            </span>
                          )}
                          {link.badge === "live" && (
                            <span
                              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                              style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: "var(--bad)" }}
                                aria-hidden
                              />
                              Live
                            </span>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 text-faint flex-shrink-0" />
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
