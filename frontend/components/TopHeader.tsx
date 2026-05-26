"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  Flame,
  Home,
  LineChart,
  LogIn,
  Menu,
  Newspaper,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LoginModal } from "./LoginModal";

const NAV = [
  { label: "Home", href: "/", icon: Home },
  { label: "Markets", href: "/markets", icon: TrendingUp },
  { label: "Stocks", href: "/companies", icon: Activity },
  { label: "Funds", href: "/funds", icon: Sparkles },
  { label: "Economy", href: "/economy", icon: LineChart },
  { label: "News", href: "/news", icon: Newspaper },
  { label: "Sectors", href: "/sectors", icon: Flame },
];

export function TopHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  const pathname = usePathname() || "/";
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <header
        className="h-16 border-b flex items-center justify-between px-3 sm:px-4 lg:px-6 gap-3"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <button
            onClick={onMenuOpen}
            className="lg:hidden h-9 w-9 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center transition"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-thin">
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive =
              n.href === "/"
                ? pathname === "/"
                : pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className="inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-md text-[13px] font-semibold whitespace-nowrap transition"
                style={{
                  background: isActive ? "var(--accent-soft)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-soft)",
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Link
            href="/alerts"
            className="hidden sm:inline-flex h-9 w-9 rounded-md hover:bg-[var(--bg-3)] items-center justify-center relative transition"
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
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-semibold text-white transition hover:opacity-90"
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
            className="hidden md:inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-semibold border transition hover:bg-[var(--bg-3)]"
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
            className="h-9 w-9 rounded-full border flex items-center justify-center transition hover:bg-[var(--bg-3)]"
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
