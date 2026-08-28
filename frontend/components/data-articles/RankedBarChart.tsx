"use client";

/**
 * Chart module — Developer Project Brief (Aug 24 2026), Workstream A §3.2.
 *
 *  "Ranked horizontal bar chart, top 10, animated on load; 30/90-day period
 *   toggle re-renders without page reload. Hover/focus detail card per row:
 *   total bought, # of insiders, avg. buy price, % since purchase, % above
 *   52-week low, cluster-buy flag, largest buyer. Keyboard accessible (rows
 *   are focusable)."
 *
 * Frame (§2.1): title / subtitle / toggle / source line / "Scored by IQS" mark.
 * The payload is the API spec (`/data-articles/:slug/chart?period=`); this
 * component renders whatever kind of row it gets (USD or % values) so all four
 * launch articles share one module. Reduced motion disables the load animation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { IqsBadge } from "./IqsBadge";

export type Variant = "all" | "discretionary" | "planned";

export interface ChartRow {
  rank: number;
  key: string;
  label: string;
  sublabel: string | null;
  href: string | null;
  value: number;
  valueKind: "usd" | "pct";
  iqs: number | null;
  detail: Record<string, any>;
}

export interface ChartPayload {
  slug: string;
  period: string;
  periodLabel: string;
  asOf: string;
  refreshedAt: string;
  valueKind: "usd" | "pct";
  valueLabel: string;
  variants: Partial<Record<Variant, ChartRow[]>>;
  totals: Record<string, number | string | null>;
  source: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PERIOD_LABEL: Record<string, string> = { "30d": "30 days", "90d": "90 days", "12m": "12 months", ttm: "Trailing 12 mo" };
const VARIANT_LABEL: Record<Variant, string> = { all: "All sales", discretionary: "Discretionary", planned: "Planned (10b5-1)" };

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const on = () => setReduced(mq.matches);
      mq.addEventListener?.("change", on);
      return () => mq.removeEventListener?.("change", on);
    } catch {
      return undefined;
    }
  }, []);
  return reduced;
}

interface Props {
  slug: string;
  chart: "insider-buys" | "insider-sells" | "analysts" | "hedge-funds";
  periods: string[];
  title: string;
  subtitle?: string;
  /** Called after each load so the page can render the "Updated" date. */
  onLoaded?: (p: ChartPayload) => void;
}

export function RankedBarChart({ slug, chart, periods, title, subtitle, onLoaded }: Props) {
  const [period, setPeriod] = useState(periods[0]);
  const [variant, setVariant] = useState<Variant>(chart === "insider-sells" ? "discretionary" : "all");
  const [active, setActive] = useState<number | null>(null);
  const [animated, setAnimated] = useState(false);
  const reduced = usePrefersReducedMotion();
  const rowsRef = useRef<Array<HTMLDivElement | null>>([]);

  const { data, isLoading, error } = useSWR<ChartPayload>(`${API_BASE}/data-articles/${slug}/chart?period=${period}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (data) onLoaded?.(data);
  }, [data, onLoaded]);

  // Animate on load (and on every period/variant change) unless reduced motion.
  useEffect(() => {
    setAnimated(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimated(true)));
    return () => cancelAnimationFrame(id);
  }, [data, variant]);

  const rows = useMemo(() => data?.variants?.[variant] ?? data?.variants?.all ?? [], [data, variant]);
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  const kind = data?.valueKind ?? (chart === "insider-buys" || chart === "insider-sells" ? "usd" : "pct");
  const isStock = chart === "insider-buys" || chart === "insider-sells";
  const variants = Object.keys(data?.variants ?? {}) as Variant[];

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
      rowsRef.current[next]?.focus();
    } else if (e.key === "Escape") {
      setActive(null);
      (e.currentTarget as HTMLElement).blur();
    } else if ((e.key === "Enter" || e.key === " ") && rows[i]?.href) {
      e.preventDefault();
      window.location.href = rows[i].href!;
    }
  };

  return (
    <section
      className="card overflow-hidden"
      aria-label={title}
      style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--bg-elevated)" }}
    >
      {/* Frame header: title / subtitle / toggle */}
      <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] sm:text-[19px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-mute)" }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {periods.length > 1 && (
            <div role="tablist" aria-label="Period" className="inline-flex rounded-lg p-0.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              {periods.map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1 rounded-md text-[12px] font-semibold font-mono transition-colors"
                  style={{
                    background: period === p ? "var(--accent)" : "transparent",
                    color: period === p ? "#fff" : "var(--text-soft)",
                  }}
                >
                  {PERIOD_LABEL[p] ?? p}
                </button>
              ))}
            </div>
          )}
          {variants.length > 1 && (
            <div role="tablist" aria-label="Sale type" className="inline-flex rounded-lg p-0.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              {(["discretionary", "planned", "all"] as Variant[])
                .filter((v) => variants.includes(v))
                .map((v) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={variant === v}
                    onClick={() => setVariant(v)}
                    className="px-3 py-1 rounded-md text-[12px] font-semibold transition-colors"
                    style={{
                      background: variant === v ? "var(--accent)" : "transparent",
                      color: variant === v ? "#fff" : "var(--text-soft)",
                    }}
                  >
                    {VARIANT_LABEL[v]}
                  </button>
                ))}
            </div>
          )}
        </div>
      </header>

      {/* Bars */}
      <div className="px-3 sm:px-5 py-3 relative" onMouseLeave={() => setActive(null)}>
        {error && (
          <p className="text-[13px] py-6 text-center" style={{ color: "var(--bad)" }}>
            The chart data could not be loaded. Please try again shortly.
          </p>
        )}
        {!error && isLoading && !data && (
          <div className="space-y-2 py-2" aria-busy="true" aria-label="Loading chart">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-9 rounded-md animate-pulse" style={{ background: "var(--bg-2)", width: `${95 - i * 7}%` }} />
            ))}
          </div>
        )}
        {!error && data && rows.length === 0 && (
          <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-mute)" }}>
            No qualifying rows for this period yet.
          </p>
        )}
        {rows.length > 0 && (
          <ol className="space-y-1.5" aria-label={`Top ${rows.length}, ranked by ${data?.valueLabel ?? "value"}`}>
            {rows.map((r, i) => {
              const w = Math.max(3, (r.value / max) * 100);
              const isActive = active === i;
              const valueText = kind === "usd" ? fmtUsd(r.value) : fmtPct(r.value);
              return (
                <li key={r.key} className="relative">
                  <div
                    ref={(el) => {
                      rowsRef.current[i] = el;
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`#${r.rank} ${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}: ${valueText}${r.iqs !== null ? `, Insider Score ${r.iqs}` : ""}. Press Enter to open.`}
                    aria-expanded={isActive}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setActive((a) => (a === i ? null : a));
                    }}
                    onKeyDown={(e) => onKey(e, i)}
                    className="group grid items-center gap-2 sm:gap-3 rounded-lg px-1.5 py-1 outline-none transition-colors"
                    style={{
                      gridTemplateColumns: "22px minmax(0, 1fr)",
                      background: isActive ? "var(--accent-soft)" : "transparent",
                      boxShadow: isActive ? "inset 0 0 0 1.5px var(--accent)" : "none",
                    }}
                  >
                    <span className="font-mono text-[12px] tabular-nums text-right" style={{ color: "var(--text-mute)" }}>
                      {r.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0 mb-1">
                        {isStock && <CompanyLogo ticker={r.key} name={r.sublabel ?? r.label} size={20} />}
                        {r.href ? (
                          <Link href={r.href} className="font-semibold text-[13.5px] truncate hover:underline" tabIndex={-1} style={{ color: "var(--text)" }}>
                            {r.label}
                          </Link>
                        ) : (
                          <span className="font-semibold text-[13.5px] truncate">{r.label}</span>
                        )}
                        {r.sublabel && (
                          <span className="text-[12px] truncate hidden sm:inline" style={{ color: "var(--text-mute)" }}>
                            {r.sublabel}
                          </span>
                        )}
                        {r.detail?.cluster && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-[1px] shrink-0"
                            style={{ background: "var(--gold-soft)", color: "#8a6d00", border: "1px solid #C9A227" }}
                            title="Cluster: three or more insiders in the window"
                          >
                            Cluster
                          </span>
                        )}
                        <IqsBadge iqs={r.iqs} />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-[18px] rounded-sm flex-1 relative overflow-hidden" style={{ background: "var(--bg-2)" }}>
                          <div
                            className="h-full rounded-sm"
                            style={{
                              width: animated || reduced ? `${w}%` : "0%",
                              // #1 in the brand gold so it reads as the leader in BOTH themes —
                              // navy (--brand-surface) vanished against the dark track (George, 2026-08-29).
                              background: i === 0 ? "#C9A227" : "var(--accent)",
                              opacity: i === 0 ? 1 : 0.9 - i * 0.03,
                              transition: reduced ? "none" : `width 700ms cubic-bezier(.2,.8,.2,1) ${i * 45}ms`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[13px] font-semibold tabular-nums shrink-0 w-[78px] text-right">{valueText}</span>
                      </div>
                    </div>
                  </div>

                  {/* Detail tooltip card (§2.1: navy, mono labels) */}
                  {isActive && (
                    <DetailCard row={r} chart={chart} periodLabel={data?.periodLabel ?? ""} alignBottom={i >= rows.length - 3} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Source line + IQS mark */}
      <footer className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-mute)" }}>
        <span>
          Source: {data?.source ?? "SEC filings"}
          {data?.asOf ? ` · data to ${fmtDate(data.asOf)}` : ""}
        </span>
        <Link href="/methodology#insider-score" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--text-soft)" }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--good)" }} />
          Scored by IQS
        </Link>
      </footer>
    </section>
  );
}

function DetailCard({ row, chart, periodLabel, alignBottom }: { row: ChartRow; chart: Props["chart"]; periodLabel: string; alignBottom: boolean }) {
  const d = row.detail || {};
  const items: Array<[string, string]> =
    chart === "insider-buys" || chart === "insider-sells"
      ? [
          [chart === "insider-buys" ? "Total bought" : "Total sold", fmtUsd(d.total)],
          ["# of insiders", String(d.insiders ?? "—")],
          [chart === "insider-buys" ? "Avg. buy price" : "Avg. sale price", fmtPrice(d.avgPrice)],
          [chart === "insider-buys" ? "% since purchase" : "% since sale", fmtPct(d.pctSince)],
          chart === "insider-buys" ? ["% above 52-wk low", fmtPct(d.pctAbove52wLow)] : ["% below 52-wk high", fmtPct(d.pctBelow52wHigh)],
          ["Cluster", d.cluster ? "Yes — 3+ insiders" : "No"],
          [chart === "insider-buys" ? "Largest buyer" : "Largest seller", d.largest ? `${d.largest.name}${d.largest.role ? ` (${d.largest.role})` : ""} · ${fmtUsd(d.largest.value)}` : "—"],
          ["Window", periodLabel],
        ]
      : chart === "analysts"
        ? [
            ["Hit rate", fmtPct(d.successRate, 0).replace("+", "")],
            ["Avg. return after call", fmtPct(d.avgReturn)],
            ["Graded calls", `${d.scoredRatings ?? "—"} of ${d.ratings ?? "—"}`],
            ["Firm", d.firm ?? "—"],
            ["Main sector", d.mainSector ?? "—"],
            ["Most-rated", Array.isArray(d.topSymbols) ? d.topSymbols.slice(0, 4).join(", ") : "—"],
            ["Latest call", d.latest ? `${d.latest.symbol}${d.latest.priceTarget ? ` · PT $${Number(d.latest.priceTarget).toFixed(0)}` : ""} · ${fmtDate(d.latest.publishedDate)}` : "—"],
          ]
        : [
            ["TTM return (disclosed longs)", fmtPct(d.performance)],
            ["Portfolio value", fmtUsd(d.portfolioValue)],
            ["Positions", String(d.positions ?? "—")],
            ["Latest 13F", fmtDate(d.asOf)],
            ["Top holdings", Array.isArray(d.topHoldings) ? d.topHoldings.map((h: any) => h.ticker).join(", ") : "—"],
            ["Insider-buy overlap", Array.isArray(d.overlap) && d.overlap.length ? d.overlap.map((h: any) => h.ticker).join(", ") : "None in 90d"],
          ];
  return (
    <div
      role="tooltip"
      className="absolute z-20 left-8 right-2 sm:left-auto sm:right-4 sm:w-[340px] rounded-xl p-3.5 shadow-lg"
      style={{
        background: "#0A1E3C",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.12)",
        ...(alignBottom ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }),
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-bold text-[14px] truncate">
            #{row.rank} {row.label}
          </div>
          {row.sublabel && <div className="text-[11.5px] truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{row.sublabel}</div>}
        </div>
        <IqsBadge iqs={row.iqs} size="md" />
      </div>
      <dl className="grid gap-y-1.5" style={{ gridTemplateColumns: "auto 1fr" }}>
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[10.5px] uppercase tracking-wider pr-3 self-center" style={{ color: "rgba(255,255,255,0.62)" }}>
              {k}
            </dt>
            <dd className="text-[12.5px] font-medium text-right tabular-nums truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {row.href && (
        <Link href={row.href} className="mt-2.5 inline-block text-[12px] font-semibold" style={{ color: "#9FD6FF" }}>
          Open →
        </Link>
      )}
    </div>
  );
}
