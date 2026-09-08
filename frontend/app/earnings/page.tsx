"use client";
import useSWR from "swr";
import Link from "next/link";
import { Calendar, TrendingDown, TrendingUp } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { pct, signColor, signedMoney } from "@/lib/signed-format";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";
import { ToolIntro } from "@/components/ToolIntro";
import { PremiumValue } from "@/components/premium/PremiumValue";

interface EarningsRow {
  date: string;
  symbol: string;
  name: string;
  estimate: string | null;
  lastEpsForecast: string | null;
  marketCap: string | null;
  time: string | null;
}

function readableTime(t: string | null): string {
  if (!t) return "—";
  if (t.includes("pre-market")) return "Pre-market";
  if (t.includes("after-hours")) return "After hours";
  if (t.includes("not-supplied")) return "—";
  return t.replace(/-/g, " ");
}

function dateLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Parse a numeric value out of a formatted string (e.g. "$1.2B", "0.45") for
 *  sorting. Returns null when there's no parseable number. */
function numericValue(s: string | null): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/[tT]\b|[tT]$/.test(s)) n *= 1e12;
  else if (/[bB]\b|[bB]$/.test(s)) n *= 1e9;
  else if (/[mM]\b|[mM]$/.test(s)) n *= 1e6;
  else if (/[kK]\b|[kK]$/.test(s)) n *= 1e3;
  return n;
}

interface EaiQuarter {
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  reactionPct: number | null;
  basis: "price" | "eps";
  bought: boolean;
  buyValue: number;
  buyers: number;
}

interface EaiScore {
  ticker: string;
  eai: number;
  aligned: number;
  strong: number;
  quarters: EaiQuarter[];
}

/** GET /earnings/signals — analyst target / upside and trailing-quarter insider
 *  $ flows per symbol (client 2026-09-06: the three columns Hot Sectors got,
 *  on the earnings calendar too). */
interface EarningsSignal {
  symbol: string;
  price: number | null;
  priceTarget: number | null;
  analystCount: number | null;
  analystUpside: number | null;
  insiderBuys: number;
  insiderSells: number;
  insiderBuyValue: number;
  insiderSellValue: number;
  netInsiderValue: number;
}

/** Hover text spelling out exactly what the score counted. */
function eaiTitle(e: EaiScore): string {
  const head =
    e.eai === 0
      ? `Earnings Alignment Index 0/100 — we checked the last ${e.strong} strong quarters and found no insider buying in the quarter before any of them.`
      : `Earnings Alignment Index ${e.eai}/100 — insiders bought ahead of ${e.aligned} of the last ${e.strong} strong quarters.`;
  const detail = e.quarters
    .map((q) => {
      const strength =
        q.basis === "price" && q.reactionPct != null
          ? `stock ${q.reactionPct >= 0 ? "+" : ""}${q.reactionPct}% after the report`
          : `EPS ${q.epsActual ?? "—"} vs ${q.epsEstimated ?? "—"} est`;
      const buying = q.bought
        ? `${q.buyers} insider${q.buyers === 1 ? "" : "s"} bought in the quarter before`
        : "no insider buying in the quarter before";
      return `${q.date}: ${strength} · ${buying}`;
    })
    .join("\n");
  return `${head}\n\n${detail}`;
}

/** The EAI value pill — a scored zero renders as 0, 3-for-3 gets the gold
 *  treatment. The real number only ever renders inside <PremiumValue>. */
function EaiPill({ e }: { e: EaiScore }) {
  // A scored zero is shown as a zero (client 2026-09-06: the
  // column "doesn't have any value" when zeros hide behind a
  // dash). Only an UNSCORED company gets the dash above.
  if (e.eai === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-bold tabular whitespace-nowrap text-mute"
        style={{ background: "var(--bg-3)" }}
        title={eaiTitle(e)}
      >
        0<span className="font-semibold opacity-70">· 0/{e.strong}</span>
      </span>
    );
  }
  // 3-for-3 is the strongest form of the flag; anything lower
  // is still shown, just without the gold treatment.
  const flagged = e.eai === 100;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-bold tabular whitespace-nowrap"
      style={{
        background: flagged ? "#d4a92a" : "var(--bg-3)",
        color: flagged ? "#141620" : "var(--text-soft)",
      }}
      title={eaiTitle(e)}
    >
      {flagged && <span aria-hidden>★</span>}
      {e.eai}
      <span className="font-semibold opacity-70">
        · {e.aligned}/{e.strong}
      </span>
    </span>
  );
}

export default function EarningsPage() {
  const { data, isLoading } = useSWR<{ rows: EarningsRow[] }>(
    `${API_BASE}/earnings/calendar?days=7`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  // Scores are computed nightly and cached, so this is a cheap second call
  // rather than something the calendar has to wait on.
  const { data: eaiData } = useSWR<{ rows: Record<string, EaiScore> }>(
    `${API_BASE}/eai`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const eaiByTicker = eaiData?.rows || {};
  const { data: signalData } = useSWR<{ rows: Record<string, EarningsSignal> }>(
    `${API_BASE}/earnings/signals?days=7`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const signalOf = (r: EarningsRow): EarningsSignal | undefined =>
    signalData?.rows?.[(r.symbol || "").toUpperCase()];
  const rows = data?.rows || [];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Calendar className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Earnings Calendar
          </span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1
          className="text-[28px] sm:text-[34px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          Upcoming Earnings Releases
        </h1>
        <ToolIntro tagline="See who’s reporting — and whether their insiders have been buying.">
          Earnings calendars show you the date. We show you what insiders were doing in the quarter before it. Companies where insiders bought ahead of their last three strong quarters are flagged with our Earnings Alignment Index (EAI) — the pre-earnings insider signal most investors have never heard of.
        </ToolIntro>
      </header>

      {isLoading ? (
        <div className="card p-12 text-center text-mute">Loading earnings calendar…</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          No earnings reports scheduled for the next 7 days.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable<EarningsRow>
            rows={rows}
            rowKey={(r) => `${r.date}-${r.symbol}`}
            // Client 2026-09-08: "paygate it the same way we do insider
            // scores, descending order" — the EAI is the paid value on this
            // page, so the calendar opens ranked by it, highest first, and
            // the cell is a <PremiumValue> (blurred decoy, never the real
            // score) for visitors. Unscored names ("—") sort to the bottom.
            initialSort={{ key: "eai", dir: "desc" }}
            columns={[
              rankColumn<EarningsRow>(),
              {
                key: "symbol",
                label: "Company",
                sortValue: (r) => r.symbol,
                render: (r) => (
                  <span className="inline-flex items-center gap-2">
                    {r.symbol && <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />}
                    <Link
                      href={r.symbol ? `/companies/${encodeURIComponent(r.symbol)}` : "#"}
                      className="flex items-center gap-2"
                    >
                      <CompanyLogo ticker={r.symbol || ""} name={r.name} size={22} />
                      <div className="min-w-0">
                        <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                          {r.symbol || "—"}
                        </div>
                        <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                          {r.name}
                        </div>
                      </div>
                    </Link>
                  </span>
                ),
              },
              {
                key: "eai",
                label: "EAI",
                pro: true,
                align: "center",
                sortValue: (r) => eaiByTicker[(r.symbol || "").toUpperCase()]?.eai ?? -1,
                render: (r) => {
                  const e = eaiByTicker[(r.symbol || "").toUpperCase()];
                  if (!e) return <span className="text-faint text-[13px]">—</span>;
                  return (
                    <PremiumValue label="EAI">
                      <EaiPill e={e} />
                    </PremiumValue>
                  );
                },
              },
              {
                key: "marketCap",
                label: "Market Cap",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => numericValue(r.marketCap),
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {(() => {
                      const v = numericValue(r.marketCap);
                      return v != null && Number.isFinite(v) && v > 0 ? formatCurrency(v) : "—";
                    })()}
                  </span>
                ),
              },
              {
                key: "priceTarget",
                label: "Analyst Price Target",
                info: "Sell-side consensus (average) 12-month price target. The sub-line is how many analysts stand behind it.",
                align: "right",
                sortValue: (r) => signalOf(r)?.priceTarget ?? null,
                render: (r) => {
                  const s = signalOf(r);
                  if (!s || s.priceTarget == null)
                    return <span className="text-faint text-[13px]">—</span>;
                  return (
                    <>
                      <span className="tabular text-[13px] font-bold">${s.priceTarget.toFixed(2)}</span>
                      {s.analystCount != null && s.analystCount > 0 && (
                        <span className="block text-[11px] text-mute tabular">
                          {s.analystCount} analyst{s.analystCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </>
                  );
                },
              },
              {
                key: "analystUpside",
                label: "Upside / Downside",
                info: "Consensus price target vs. the current price: positive means analysts see room to rise, negative means the stock already trades above their target.",
                align: "right",
                filterable: true,
                filterType: "range",
                sortValue: (r) => signalOf(r)?.analystUpside ?? null,
                render: (r) => {
                  const s = signalOf(r);
                  if (!s || s.analystUpside == null)
                    return <span className="text-faint text-[13px]">—</span>;
                  return (
                    <span
                      className="tabular text-[13px] font-bold inline-flex items-center gap-1 justify-end"
                      style={{ color: signColor(s.analystUpside) }}
                    >
                      {s.analystUpside >= 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                      {pct(s.analystUpside, true, 1)}
                    </span>
                  );
                },
              },
              {
                key: "netInsiderValue",
                label: "Net Insider Buying vs Selling ($)",
                info: "Open-market insider purchases minus sales over the last 90 days — the open trading window after the previous report — in dollars, from the company's Form 4 filings. The sub-line shows the two sides.",
                align: "right",
                sortValue: (r) => signalOf(r)?.netInsiderValue ?? null,
                render: (r) => {
                  const s = signalOf(r);
                  if (!s) return <span className="text-faint text-[13px]">—</span>;
                  if (s.insiderBuys + s.insiderSells === 0)
                    return <span className="text-faint text-[12px]">No filings in 90d</span>;
                  return (
                    <>
                      <span className="tabular text-[13px] font-bold" style={{ color: signColor(s.netInsiderValue) }}>
                        {signedMoney(s.netInsiderValue)}
                      </span>
                      <span className="block text-[11px] text-mute tabular whitespace-nowrap">
                        <span style={{ color: "var(--good)" }}>{formatCurrency(s.insiderBuyValue)}</span> bought ·{" "}
                        <span style={{ color: "var(--bad)" }}>{formatCurrency(s.insiderSellValue)}</span> sold
                      </span>
                    </>
                  );
                },
              },
              {
                key: "date",
                label: "Date",
                filterable: true,
                filterType: "select",
                filterLabel: (r) => dateLabel(r.date),
                sortValue: (r) => r.date,
                render: (r) => (
                  <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "var(--text)" }}>
                    {dateLabel(r.date)}
                  </span>
                ),
              },
              {
                key: "time",
                label: "Time",
                filterable: true,
                sortValue: (r) => readableTime(r.time),
                render: (r) => (
                  <span
                    className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                    style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
                  >
                    {readableTime(r.time)}
                  </span>
                ),
              },
              {
                key: "estimate",
                label: "EPS Forecast",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => numericValue(r.estimate),
                render: (r) => (
                  <span className="tabular font-bold text-[14px]">{r.estimate || "—"}</span>
                ),
              },
              {
                key: "lastEps",
                label: "Last EPS",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => numericValue(r.lastEpsForecast),
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.lastEpsForecast || "—"}
                  </span>
                ),
              },
            ]}
          />
          {/* What the EAI column means, in one line — the score is useless if
              the reader has to guess what 100 · 3/3 counted. */}
          <div
            className="px-4 py-3 text-[12.5px] text-mute"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="font-bold" style={{ color: "var(--text-soft)" }}>EAI</span> — Earnings
            Alignment Index: of this company&rsquo;s last three strong quarters (the stock rose after
            the report), how many did insiders buy ahead of, in the quarter before it.{" "}
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold"
              style={{ background: "#d4a92a", color: "#141620" }}
            >
              ★ 100
            </span>{" "}
            means all three.
          </div>
        </div>
      )}
    </div>
  );
}
