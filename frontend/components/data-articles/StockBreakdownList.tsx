"use client";

/**
 * The per-stock breakdown — George, 2026-09-23:
 *
 *   "A simple breakdown via List style, including stock charts and financial
 *    snapshots for each. Insider score. Analyst rating and upside etc.
 *    Bullish and bearish notes."
 *
 * One card per name in the list above it. Every figure is served by the
 * article's own payload, so the card cannot disagree with the table.
 *
 * The bull and bear columns are generated from the data, not written, and each
 * line shows the source of the number behind it. A name with nothing to say on
 * one side prints that in words: an empty column would read as "we checked and
 * there is nothing wrong", which is a claim we have not made.
 */

import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { IqsBadge } from "./IqsBadge";
import type { ChartPayload, ChartRow } from "./RankedBarChart";

export interface ProfileNote {
  text: string;
  source: string;
}

export interface StockProfile {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  price: number | null;
  changePct: number | null;
  ytdPct: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  rangePosition: number | null;
  marketCap: number | null;
  spark: Array<[number, number]>;
  financials: {
    revenueTtm: number | null;
    netIncomeTtm: number | null;
    grossMargin: number | null;
    freeCashFlowTtm: number | null;
    totalDebt: number | null;
    cash: number | null;
    peRatio: number | null;
    periodEnd: string | null;
    quartersCounted: number;
  } | null;
  insider: {
    iqs: number | null;
    distinctBuyers: number;
    transactionCount: number;
    totalPurchaseValue: number;
    avgBuyPrice: number | null;
    topBuyerRole: string | null;
    reasoning: string | null;
    asOf: string | null;
  } | null;
  analyst: {
    targetAvg: number | null;
    targetHigh: number | null;
    targetLow: number | null;
    count: number;
    upsidePct: number | null;
    latestDate: string | null;
    firms: string[];
  } | null;
  bull: ProfileNote[];
  bear: ProfileNote[];
}

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/** A year of closes as one path. No library — it is 120 points. */
function Sparkline({ points, up }: { points: Array<[number, number]>; up: boolean }) {
  if (!points || points.length < 2) {
    return (
      <div className="flex items-center justify-center h-[72px] text-[11.5px]" style={{ color: "var(--text-mute)" }}>
        No price history on file
      </div>
    );
  }
  const W = 260;
  const H = 72;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (x: number) => (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * W);
  const sy = (y: number) => (y1 === y0 ? H / 2 : H - ((y - y0) / (y1 - y0)) * (H - 8) - 4);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
  const stroke = up ? "var(--good)" : "var(--bad)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="One-year price history" preserveAspectRatio="none">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={stroke} opacity={0.1} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[1.2px]" style={{ color: "var(--text-mute)" }}>
        {label}
      </div>
      <div
        className="text-[13.5px] font-semibold tabular-nums"
        style={{ color: tone === "good" ? "var(--good-strong)" : tone === "bad" ? "var(--bad-strong)" : "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Notes({ title, notes, tone }: { title: string; notes: ProfileNote[]; tone: "good" | "bad" }) {
  const color = tone === "good" ? "var(--good-strong)" : "var(--bad-strong)";
  return (
    <div>
      <h4 className="font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] mb-1.5" style={{ color }}>
        {title}
      </h4>
      <ul className="space-y-1.5">
        {notes.map((n, i) => (
          <li key={i} className="text-[13px] leading-snug">
            <span style={{ color: "var(--text)" }}>{n.text}</span>{" "}
            <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>
              — {n.source}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ row, profile }: { row: ChartRow; profile: StockProfile | undefined }) {
  const p = profile;
  const spark = p?.spark ?? [];
  const up = spark.length > 1 ? spark[spark.length - 1][1] >= spark[0][1] : (p?.ytdPct ?? 0) >= 0;
  const fin = p?.financials ?? null;

  return (
    <li className="rounded-xl p-4 sm:p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-3">
        <span className="font-mono text-[12px] font-bold mt-1 shrink-0 tabular-nums" style={{ color: "var(--text-mute)" }}>
          {String(row.rank).padStart(2, "0")}
        </span>
        <CompanyLogo ticker={row.label} name={row.sublabel ?? row.label} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-[17px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              {row.href ? (
                <Link href={row.href} className="hover:underline">
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </h3>
            <span className="text-[14px] truncate" style={{ color: "var(--text-soft)" }}>
              {row.sublabel}
            </span>
            {p?.insider?.iqs != null && <IqsBadge iqs={p.insider.iqs} />}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-mute)" }}>
            {[p?.sector, p?.industry, p?.exchange].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Chart + price context */}
        <div>
          <Sparkline points={spark} up={up} />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="Last" value={price(p?.price)} />
            <Stat label="YTD" value={pct(p?.ytdPct)} tone={(p?.ytdPct ?? 0) >= 0 ? "good" : "bad"} />
            <Stat label="Mkt cap" value={usd(p?.marketCap)} />
            <Stat label="52w low" value={price(p?.yearLow)} />
            <Stat label="52w high" value={price(p?.yearHigh)} />
            <Stat label="P/E" value={fin?.peRatio != null ? fin.peRatio.toFixed(1) : "—"} />
          </div>
        </div>

        {/* Financial snapshot, insider score, analyst view */}
        <div className="space-y-3">
          <div>
            <h4 className="font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] mb-1.5" style={{ color: "var(--text-mute)" }}>
              Financial snapshot{fin?.periodEnd ? ` · trailing twelve months to ${fin.periodEnd}` : ""}
              {fin && fin.quartersCounted > 0 && fin.quartersCounted < 4 ? ` · only ${fin.quartersCounted} quarter${fin.quartersCounted === 1 ? "" : "s"} on file` : ""}
            </h4>
            {fin ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Revenue (TTM)" value={usd(fin.revenueTtm)} />
                <Stat label="Net income (TTM)" value={usd(fin.netIncomeTtm)} tone={fin.netIncomeTtm != null ? (fin.netIncomeTtm >= 0 ? "good" : "bad") : undefined} />
                <Stat label="Free cash flow (TTM)" value={usd(fin.freeCashFlowTtm)} tone={fin.freeCashFlowTtm != null ? (fin.freeCashFlowTtm >= 0 ? "good" : "bad") : undefined} />
                <Stat label="Net debt" value={fin.totalDebt != null && fin.cash != null ? usd(fin.totalDebt - fin.cash) : "—"} />
              </div>
            ) : (
              <p className="text-[12.5px]" style={{ color: "var(--text-mute)" }}>
                No filed financials on file for this company.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h4 className="font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] mb-1.5" style={{ color: "var(--text-mute)" }}>
                Insider score
              </h4>
              {p?.insider && p.insider.transactionCount > 0 ? (
                <p className="text-[13px] leading-snug" style={{ color: "var(--text)" }}>
                  {p.insider.iqs != null ? <b>{p.insider.iqs.toFixed(0)}/99</b> : <span style={{ color: "var(--text-mute)" }}>Not scored</span>} ·{" "}
                  {p.insider.distinctBuyers} buyer{p.insider.distinctBuyers === 1 ? "" : "s"}, {usd(p.insider.totalPurchaseValue)} across{" "}
                  {p.insider.transactionCount} filing{p.insider.transactionCount === 1 ? "" : "s"} (90d)
                  {p.insider.avgBuyPrice ? `, average ${price(p.insider.avgBuyPrice)}` : ""}
                </p>
              ) : (
                <p className="text-[13px] leading-snug" style={{ color: "var(--text-mute)" }}>
                  No open-market insider purchases on file in the last 90 days.
                </p>
              )}
            </div>
            <div>
              <h4 className="font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] mb-1.5" style={{ color: "var(--text-mute)" }}>
                Analyst view
              </h4>
              {p?.analyst?.targetAvg ? (
                <p className="text-[13px] leading-snug" style={{ color: "var(--text)" }}>
                  <b>{price(p.analyst.targetAvg)}</b> average target ·{" "}
                  <span style={{ color: (p.analyst.upsidePct ?? 0) >= 0 ? "var(--good-strong)" : "var(--bad-strong)" }}>{pct(p.analyst.upsidePct)}</span> ·{" "}
                  {p.analyst.count} analyst{p.analyst.count === 1 ? "" : "s"}
                  {p.analyst.targetLow != null && p.analyst.targetHigh != null
                    ? ` · range ${price(p.analyst.targetLow)}–${price(p.analyst.targetHigh)}`
                    : ""}
                </p>
              ) : (
                <p className="text-[13px] leading-snug" style={{ color: "var(--text-mute)" }}>
                  No analyst price target published in the last 180 days.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <Notes title="Bullish" notes={p?.bull ?? []} tone="good" />
            <Notes title="Bearish" notes={p?.bear ?? []} tone="bad" />
          </div>
        </div>
      </div>
    </li>
  );
}

export function StockBreakdownList({ payload }: { payload: ChartPayload }) {
  const rows = payload.variants.all ?? payload.variants.discretionary ?? [];
  const profiles = payload.profiles ?? {};
  if (!rows.length) return null;
  return (
    <section aria-labelledby="breakdown-h" className="space-y-4">
      <h2 id="breakdown-h" className="text-[20px] sm:text-[22px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
        The breakdown, name by name
      </h2>
      <ul className="space-y-4 list-none p-0">
        {rows.map((r) => (
          <Card key={r.key} row={r} profile={profiles[r.label]} />
        ))}
      </ul>
    </section>
  );
}
