"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Calculator,
  Star,
  X,
} from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";

interface FirmRow {
  firm: string;
  slug: string;
  mainSector: string | null;
  successRate: number | null;
  avgReturn: number | null;
  ratings: number;
  scoredRatings: number;
  lastRatingMs: number | null;
  stars: number;
  topSymbols: string[];
}

interface FirmResponse {
  rows: FirmRow[];
  coverage: { symbols: number; universe: number; ratings: number };
}

/** Rows visible before the upgrade wall. The row straight after fades out, the
 *  way stockanalysis.com teases the next one. */
const FREE_ROWS = 6;

const fmtDate = (ms: number | null) =>
  ms == null
    ? "—"
    : new Date(ms).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

function Stars({ value }: { value: number }) {
  // 0–5 → five glyphs, the partial one clipped to its exact fraction.
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, value - i));
          return (
            <span key={i} className="relative inline-block h-[13px] w-[13px]">
              <Star
                className="absolute inset-0 h-[13px] w-[13px]"
                style={{ color: "color-mix(in srgb, var(--gold) 28%, var(--border))" }}
                fill="currentColor"
                strokeWidth={0}
              />
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star
                    className="h-[13px] w-[13px]"
                    style={{ color: "var(--gold)" }}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </span>
              )}
            </span>
          );
        })}
      </span>
      <span className="text-[12px] text-mute tabular">({value.toFixed(2)})</span>
      <span className="sr-only">{value.toFixed(2)} out of 5</span>
    </span>
  );
}

const FACTORS = [
  {
    icon: CheckCircle2,
    title: "Success Rate",
    body: "The percentage of ratings that are profitable.",
  },
  {
    icon: BarChart3,
    title: "Average Return",
    body: "The average percentage return within one year of the rating.",
  },
  {
    icon: Calculator,
    title: "Rating Count",
    body: "The more ratings the firm has provided, the higher the score.",
  },
  {
    icon: Clock,
    title: "Recency",
    body: "Ratings provided within the past year contribute to a higher score.",
  },
];

export default function AnalystRatingsPage() {
  const { data, isLoading } = useSWR<FirmResponse>(
    // Top 50 only — the tail is weak firms nobody ranks by, and the table is a
    // single page numbered 50 down to 1.
    `${API_BASE}/market-stats/analyst-firms?limit=50`,
    fetcher,
    { refreshInterval: 15 * 60_000, revalidateOnFocus: false },
  );

  // The wall is dismissible with the cross until Stripe is wired up, but the
  // dismissal is deliberately NOT persisted — every page load puts it back.
  const [unlocked, setUnlocked] = useState(false);
  const dismiss = () => setUnlocked(true);

  const rows = data?.rows || [];
  const total = rows.length;
  // The API returns firms best-first, so rank 1 is the highest rated and rank
  // `total` the lowest. The page then lists them the other way up — worst at the
  // top, counting down to the number 1 firm at the bottom.
  const ordered = useMemo(
    () =>
      rows
        .map((r, i) => ({ ...r, rank: i + 1 }))
        .reverse(),
    [rows],
  );
  const visible = useMemo(
    () => (unlocked ? ordered : ordered.slice(0, FREE_ROWS + 1)),
    [ordered, unlocked],
  );
  const filling =
    data != null && data.coverage.symbols < data.coverage.universe;

  return (
    <div className="w-full space-y-8">
      <header>
        <h1
          className="text-[30px] sm:text-[34px] font-bold tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          Top Wall Street Analysts
        </h1>
        <p className="text-[14px] sm:text-[15px] font-semibold text-mute mt-1.5">
          A list of Wall Street research firms, ranked by their performance
        </p>
        <div
          className="mt-4"
          style={{ borderBottom: "3px solid var(--accent)" }}
        />
      </header>

      <AdSlot slot="leaderboard" seed="analyst-top" />

      <div className="card overflow-hidden">
        {isLoading && !total ? (
          <div className="text-center text-mute py-12 text-[14px]">
            Scoring every sell-side rating against its forward one-year return…
          </div>
        ) : !total ? (
          <div className="text-center text-mute py-12 text-[14px]">
            No rating history available right now. Check back shortly.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]" style={{ minWidth: 860 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-strong)",
                    background: "var(--bg-2)",
                  }}
                >
                  {[
                    { k: "#", a: "left" },
                    { k: "Research Firm", a: "left" },
                    { k: "Top Coverage", a: "left" },
                    { k: "Main Sector", a: "left" },
                    { k: "Success Rate", a: "right" },
                    { k: "Average Return", a: "right" },
                    { k: "Ratings", a: "right" },
                    { k: "Last Rating", a: "right" },
                  ].map((h) => (
                    <th
                      key={h.k}
                      className="px-3 py-2.5 text-[13px] font-bold whitespace-nowrap"
                      style={{
                        textAlign: h.a as "left" | "right",
                        color: "var(--text)",
                      }}
                    >
                      {h.k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const num = r.rank;
                  const teaser = !unlocked && i === FREE_ROWS;
                  return (
                    <tr
                      key={r.slug || r.firm}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        opacity: teaser ? 0.28 : 1,
                        pointerEvents: teaser ? "none" : undefined,
                      }}
                    >
                      <td className="px-3 py-2.5 text-mute tabular text-[13px]">
                        {num}
                      </td>
                      <td className="px-3 py-2.5">
                        <div
                          className="font-bold text-[14px]"
                          style={{ color: "var(--accent)" }}
                        >
                          {r.firm}
                        </div>
                        <Stars value={r.stars} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          {r.topSymbols.map((s) => (
                            <Link
                              key={s}
                              href={`/companies/${encodeURIComponent(s)}`}
                              className="font-mono text-[12px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                background: "var(--bg-3)",
                                color: "var(--text-soft)",
                              }}
                            >
                              {s}
                            </Link>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[13px]" style={{ color: "var(--text)" }}>
                        {r.mainSector || "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular font-bold"
                        style={{
                          color:
                            (r.successRate ?? 0) >= 50 ? "var(--good)" : "var(--bad)",
                        }}
                      >
                        {r.successRate != null ? `${r.successRate.toFixed(2)}%` : "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular font-bold"
                        style={{
                          color:
                            (r.avgReturn ?? 0) >= 0 ? "var(--good)" : "var(--bad)",
                        }}
                      >
                        {r.avgReturn != null
                          ? `${r.avgReturn >= 0 ? "" : ""}${r.avgReturn.toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular text-[13px]">
                        {r.ratings}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular text-[13px] whitespace-nowrap text-mute">
                        {fmtDate(r.lastRatingMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Upgrade wall — dismissible with the cross while Stripe is pending. */}
        {!unlocked && total > FREE_ROWS && (
          <div
            className="relative px-6 py-10 text-center"
            style={{ background: "var(--bg-2)", borderTop: "1px solid var(--border)" }}
          >
            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-3 right-3 inline-flex items-center justify-center h-8 w-8 rounded-full"
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-soft)",
              }}
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="text-[22px] font-bold" style={{ color: "var(--text)" }}>
              Upgrade to Premium
            </h2>
            <p className="text-mute text-[14px] mt-1.5">
              See all {total} top-ranked firms and their real forward performance
            </p>

            <p
              className="text-[15px] font-bold mt-6"
              style={{ color: "var(--text)" }}
            >
              Get much more with Insider Premium
            </p>
            <div className="mt-3 flex justify-center">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-left text-[14px] text-mute max-w-[560px]">
                {[
                  "The full ranked list of Wall Street research firms",
                  "Unlimited access to all data and tools",
                  "Advanced analyst filtering and sorting options",
                  "Every insider filing the moment it hits EDGAR",
                ].map((b) => (
                  <li key={b} className="flex gap-2">
                    <span style={{ color: "var(--accent)" }}>•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href="/premium"
              className="inline-flex items-center justify-center mt-7 px-6 py-2.5 rounded-lg font-bold text-[14px]"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Sign Up Today
            </Link>
          </div>
        )}
      </div>

      {filling && (
        <p className="text-[12px] text-faint">
          Table is still filling in — {data!.coverage.symbols} of{" "}
          {data!.coverage.universe} covered tickers scored so far (
          {data!.coverage.ratings.toLocaleString()} ratings). Refresh in a moment
          for the complete ranking.
        </p>
      )}

      <section
        className="pt-8"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <h2
          className="text-[26px] sm:text-[30px] font-bold text-center tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          Analyst Star Rankings
        </h2>
        <p className="text-center text-mute text-[15px] mt-2">
          Our analyst star rankings are based on these four factors
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mt-9">
          {FACTORS.map((f) => (
            <div key={f.title}>
              <div
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg mb-3"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <div className="font-bold text-[15px]" style={{ color: "var(--text)" }}>
                {f.title}
              </div>
              <p className="text-mute text-[14px] mt-1.5 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-faint">
        Ratings are sourced from published sell-side upgrade and downgrade
        actions and attributed to the research firm — individual analyst names
        are not disclosed in free data, so no analyst is named here. Success rate
        and average return are measured from each rating&rsquo;s date to one year
        later (or to today for ratings less than a year old), in the direction of
        the call. Ratings less than 30 days old are listed but not yet scored.
        Firms with fewer than 6 scored ratings are excluded. Informational only,
        not a recommendation to buy or sell any security.
      </p>
    </div>
  );
}
