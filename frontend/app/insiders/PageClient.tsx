"use client";

/**
 * TOP INSIDERS at /insiders — unified (Developer Project Brief v7, Build 3;
 * George 2026-09-23: "This is to improve our Top insiders Page
 * https://insiderbuying.com/insiders").
 *
 * Grown from the Workstream B hedge-fund grid into the destination for every
 * insider type: type tabs (All · Corporate Insiders · Congress · Hedge Funds &
 * Famous Investors) with the earlier style tabs as a secondary row, one card
 * anatomy for every type, and the Performance Grade as the comparable layer —
 * percentile-ranked within type, never across. Under the minimum sample a
 * card reads "Building track record" instead of a grade.
 */

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { UnifiedCard, type UnifiedCardData } from "@/components/wealth-tracker/UnifiedCard";
import { ComplianceFooter } from "@/components/ComplianceFooter";

const TYPES: Array<[string, string]> = [
  ["all", "All"],
  ["corporate", "Corporate Insiders"],
  ["congress", "Congress"],
  ["investor", "Hedge Funds & Famous Investors"],
];

/** Secondary row: sorts for every type, plus the editorial fund categories. */
const STYLES: Array<[string, string, "sort" | "category"]> = [
  ["popular", "Popular", "sort"],
  ["performance", "Best Performance", "sort"],
  ["active", "Most Active", "sort"],
  ["growth", "Growth Investors", "category"],
  ["value", "Value Investors", "category"],
  ["short", "Short Sellers", "category"],
  ["longterm", "Long-Term", "category"],
];

const TAB_NOTES: Record<string, string> = {
  short:
    "13F filings disclose long positions only — no fund's short book is public. These managers are listed for the short-side research they are known for; the holdings and performance shown are their disclosed long positions. Two of them no longer file: Scion deregistered in 2025 and Kynikos closed in 2023.",
};

interface Payload {
  type: string;
  sort: string;
  category: string | null;
  cards: UnifiedCardData[];
  counts: Record<string, { total: number; graded: number }>;
  computedAt: string | null;
  note: string;
}

export default function InvestorsPage() {
  const [type, setType] = useState("all");
  const [style, setStyle] = useState("popular");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("type");
    if (t && TYPES.some(([k]) => k === t)) setType(t);
    const s = sp.get("tab") || sp.get("sort");
    if (s && STYLES.some(([k]) => k === s)) setStyle(s);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams();
    if (type !== "all") sp.set("type", type);
    if (style !== "popular") sp.set("tab", style);
    const qs = sp.toString();
    window.history.replaceState(null, "", `/insiders${qs ? `?${qs}` : ""}`);
  }, [type, style]);

  const styleMeta = STYLES.find(([k]) => k === style) || STYLES[0];
  const isCategory = styleMeta[2] === "category";
  // A fund category only makes sense for funds; picking one narrows the type.
  const effectiveType = isCategory ? "investor" : type;
  const key = useMemo(() => {
    const sp = new URLSearchParams({ type: effectiveType, limit: "240" });
    if (isCategory) sp.set("category", style);
    else sp.set("sort", style);
    return `${API_BASE}/wealth-tracker/unified?${sp.toString()}`;
  }, [effectiveType, style, isCategory]);
  const { data, isLoading } = useSWR<Payload>(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true });
  const cards = data?.cards ?? [];
  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((s, c) => s + c.total, 0);

  return (
    <div className="w-full space-y-5">
      <header>
        <p className="text-[12px] uppercase tracking-[2px] font-semibold" style={{ color: "var(--text-mute)" }}>
          Top Insiders
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight mt-1">Every insider we track, graded against their peers</h1>
        <p className="mt-2 text-[15px] max-w-[76ch]" style={{ color: "var(--text-mute)" }}>
          Corporate insiders from their Form 4 filings, members of Congress from their STOCK Act disclosures, and the most-watched funds from
          their 13Fs. One card for each, a Performance Grade ranked within their own type, their last ten trades and what they hold now.
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Insider type">
        {TYPES.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={effectiveType === k}
            onClick={() => {
              setType(k);
              if (isCategory && k !== "investor") setStyle("popular");
            }}
            className="px-3.5 py-2 text-[13px] font-semibold rounded-lg whitespace-nowrap"
            style={{
              background: effectiveType === k ? "var(--accent)" : "var(--bg-2)",
              color: effectiveType === k ? "#fff" : "var(--text)",
              border: `1px solid ${effectiveType === k ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {label}
            {counts[k]?.total ? (
              <span className="ml-1.5 text-[11px] font-semibold" style={{ color: effectiveType === k ? "rgba(255,255,255,0.8)" : "var(--text-mute)" }}>
                {counts[k].total}
              </span>
            ) : k === "all" && total ? (
              <span className="ml-1.5 text-[11px] font-semibold" style={{ color: effectiveType === k ? "rgba(255,255,255,0.8)" : "var(--text-mute)" }}>
                {total}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <nav className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Sort and category">
        {STYLES.filter(([, , kind]) => kind === "sort" || type === "investor" || type === "all").map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={style === k}
            onClick={() => setStyle(k)}
            className="px-3 py-1.5 text-[12.5px] font-semibold rounded-md whitespace-nowrap"
            style={{
              background: style === k ? "var(--bg-3)" : "transparent",
              color: style === k ? "var(--text)" : "var(--text-soft)",
              border: `1px solid ${style === k ? "var(--border)" : "transparent"}`,
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {TAB_NOTES[style] && (
        <p className="text-[12.5px] leading-relaxed max-w-[80ch] rounded-lg px-3.5 py-2.5" style={{ color: "var(--text-mute)", background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          {TAB_NOTES[style]}
        </p>
      )}

      {isLoading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4" style={{ minHeight: 256 }}>
              <div className="shimmer h-12 w-12 rounded-full mb-3" />
              <div className="shimmer h-4 w-3/5 rounded mb-2" />
              <div className="shimmer h-3 w-2/5 rounded" />
            </div>
          ))}
        </div>
      ) : cards.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards.map((c) => (
            <UnifiedCard key={`${c.type}:${c.key}`} c={c} />
          ))}
        </div>
      ) : (
        <div className="card p-6 text-[14px]" style={{ color: "var(--text-mute)" }}>
          {total === 0 ? "Cards appear after the nightly grading run." : "No one matches this view yet."}
        </div>
      )}

      <p className="text-[12.5px]" style={{ color: "var(--text-soft)" }}>
        Looking for the full Form 4 table — every buyer ranked by dollars bought, with country and role filters?{" "}
        <Link href="/insiders/leaderboard" className="text-accent font-semibold">
          Open the insider leaderboard
        </Link>
        .
      </p>

      <p className="text-[12px] max-w-[100ch]" style={{ color: "var(--text-mute)" }}>
        {data?.note ||
          "Grades are percentile ranks within each insider type, on that type’s own data. Return figures are not comparable across types; the grade is."}{" "}
        A grade needs 20 trades (funds: four quarters of filings); until then a card reads “Building track record”. Grades and badges recompute
        nightly from the day a person entered the tracker.
        {data?.computedAt ? ` Recomputed ${formatDate(data.computedAt)}.` : ""}
      </p>

      <ComplianceFooter />
    </div>
  );
}
