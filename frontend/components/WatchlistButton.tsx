"use client";
import { Star } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist";

/**
 * Toggle a ticker in the personal (localStorage) watchlist. Renders a
 * star that fills when saved. `variant="icon"` for table rows / cards,
 * `variant="button"` for a labeled "+ Watchlist" on the stock detail page.
 * Stops propagation so it never triggers a surrounding row/card link.
 */
export function WatchlistButton({
  ticker,
  variant = "icon",
  size = "md",
}: {
  ticker: string;
  variant?: "icon" | "button";
  size?: "sm" | "md";
}) {
  const { has, toggle } = useWatchlist();
  const saved = has(ticker);
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(ticker);
  };
  const label = saved ? "In Watchlist" : "Add to Watchlist";

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        title={saved ? "Remove from watchlist" : "Add to watchlist"}
        className="inline-flex items-center gap-1.5 rounded-md px-3.5 h-9 text-[13px] font-semibold transition-transform hover:scale-[1.03]"
        style={{
          background: saved ? "color-mix(in srgb, var(--gold) 20%, transparent)" : "var(--bg-2)",
          color: saved ? "var(--gold)" : "var(--text-soft)",
          border: `1px solid ${saved ? "var(--gold)" : "var(--border-strong)"}`,
        }}
      >
        <Star className="h-4 w-4" fill={saved ? "var(--gold)" : "none"} />
        {label}
      </button>
    );
  }

  const dim = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const ic = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={saved ? "Remove from watchlist" : "Add to watchlist"}
      className={`inline-flex items-center justify-center ${dim} rounded-md transition hover:bg-[var(--bg-3)]`}
    >
      <Star
        className={ic}
        fill={saved ? "var(--gold)" : "none"}
        style={{ color: saved ? "var(--gold)" : "var(--text-faint)" }}
      />
    </button>
  );
}
