"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orbit } from "lucide-react";

/**
 * The bar that lets a visitor move between visualizers without going back to
 * the hub — George 2026-09-14: "start with showing the Insider Bubble then
 * able to click into it and switch visualizers from there".
 *
 * The homepage showcase opens Insider Bubbles; this is what makes the rest
 * reachable once you are inside one. Rendered on every visualizer page,
 * including the two bubble maps, which predate the suite.
 */

const ITEMS: Array<{ href: string; label: string; live?: boolean }> = [
  { href: "/bubbles", label: "Insider Bubbles", live: true },
  { href: "/congress-bubbles", label: "Congress Bubbles", live: true },
  { href: "/visualizers/prediction-markets", label: "Prediction Markets", live: true },
  { href: "/visualizers/government-contracts", label: "Government Contracts" },
  { href: "/visualizers/goldminer", label: "Goldminer AI" },
  { href: "/visualizers/biotech", label: "Biotech Catalysts" },
];

export function VisualizerSwitcher() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Switch visualizer"
      className="flex items-center gap-2 overflow-x-auto py-2"
      style={{ scrollbarWidth: "thin" }}
    >
      <Link
        href="/visualizers"
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-bold whitespace-nowrap px-1"
        style={{ color: "var(--text-mute)" }}
      >
        <Orbit className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
        Visualizers
      </Link>
      {ITEMS.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-bold whitespace-nowrap transition"
            style={
              active
                ? { background: "var(--accent)", color: "var(--on-accent, #fff)" }
                : {
                    background: "var(--bg-2)",
                    color: "var(--text-mute)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            {it.label}
            {it.live && !active && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--bad)" }}
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
