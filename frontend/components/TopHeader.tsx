"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Bell, ChevronRight, LogIn, Menu, Search, Sparkles, User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LoginModal } from "./LoginModal";

function prettify(seg: string) {
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TopHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  const pathname = usePathname() || "/";
  const [loginOpen, setLoginOpen] = useState(false);

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
    <>
      <header
        className="sticky top-0 z-20 h-16 border-b flex items-center justify-between px-4 sm:px-6 gap-4"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onMenuOpen}
            className="lg:hidden h-9 w-9 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center transition"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <nav className="hidden sm:flex items-center gap-1.5 text-sm text-mute min-w-0">
            {crumbs.map((c, i) => (
              <span key={c.href} className="inline-flex items-center gap-1.5 truncate">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-faint flex-shrink-0" />}
                {i === crumbs.length - 1 ? (
                  <span className="text-soft font-semibold truncate">{c.label}</span>
                ) : (
                  <Link href={c.href} className="hover:text-accent transition truncate">
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
            <kbd
              className="hidden lg:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 text-[10px] font-mono rounded border"
              style={{ borderColor: "var(--border-strong)", color: "var(--text-faint)" }}
            >
              ⌘ K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-semibold border transition hover:bg-[var(--bg-3)]"
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
