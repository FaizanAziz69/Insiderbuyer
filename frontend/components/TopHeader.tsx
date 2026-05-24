"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Bell, ChevronRight, Menu, Search, Sparkles, User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

function prettify(seg: string) {
  return seg
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TopHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  const pathname = usePathname() || "/";
  const crumbs = useMemo(() => {
    const segs = pathname.split("/").filter(Boolean);
    const trail: { href: string; label: string }[] = [{ href: "/", label: "Dashboard" }];
    let acc = "";
    for (const s of segs) {
      acc += "/" + s;
      trail.push({ href: acc, label: prettify(decodeURIComponent(s)) });
    }
    return trail;
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-20 h-16 border-b flex items-center justify-between px-4 sm:px-6 gap-4"
      style={{ background: "var(--bg-1)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onMenuOpen}
          className="lg:hidden h-9 w-9 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav className="hidden sm:flex items-center gap-1.5 text-sm text-mute min-w-0">
          {crumbs.map((c, i) => (
            <span key={c.href} className="inline-flex items-center gap-1.5 truncate">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-faint flex-shrink-0" />}
              {i === crumbs.length - 1 ? (
                <span className="text-soft font-medium truncate">{c.label}</span>
              ) : (
                <Link href={c.href} className="hover:text-soft truncate">
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="hidden md:block w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
          <input
            placeholder="Search insiders, symbols, sectors…"
            className="input-base pl-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/alerts"
          className="hidden sm:inline-flex h-9 w-9 rounded-md hover:bg-[var(--bg-3)] items-center justify-center relative"
          aria-label="Alerts"
        >
          <Bell className="h-4 w-4 text-soft" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--bad)]" />
        </Link>
        <Link
          href="/premium"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-semibold text-white"
          style={{
            background: "linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%)",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Premium
        </Link>
        <ThemeToggle />
        <button
          className="h-9 w-9 rounded-full border flex items-center justify-center"
          style={{ borderColor: "var(--border-strong)", background: "var(--bg-3)" }}
          aria-label="Profile"
        >
          <User className="h-4 w-4 text-soft" />
        </button>
      </div>
    </header>
  );
}
