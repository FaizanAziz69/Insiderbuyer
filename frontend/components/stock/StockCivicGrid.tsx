"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Landmark, FileText, Scale, TrendingUp, Scale3d } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";

/** QuiverQuant-style grid of equal-sized data cards on the stock page. Each
 *  card is self-contained (its own fetch) and shows a distinct dataset, all
 *  from real free sources. Cards with no data show an honest empty state. */
export function StockCivicGrid({
  ticker,
  companyName,
  sector,
  insiderScore,
}: {
  ticker: string;
  companyName: string;
  sector?: string | null;
  insiderScore?: number | null;
}) {
  return (
    <section>
      <h2 className="large-section-h mb-3"><span>Signals & Government Data</span></h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <RevenueBreakdownCard ticker={ticker} />
        <WhaleActivityCard ticker={ticker} companyName={companyName} />
        <CongressTradingCard ticker={ticker} />
        <GovContractsCard companyName={companyName} ticker={ticker} />
        <LobbyingCard companyName={companyName} ticker={ticker} />
        <BullBearCard ticker={ticker} companyName={companyName} sector={sector} insiderScore={insiderScore} />
      </div>
    </section>
  );
}

/** Revenue Breakdown — by segment / geography from the latest 10-Q/10-K
 *  (SEC EDGAR, free). QuiverQuant-style list with share bars + tabs. */
interface RevSeg { name: string; revenue: number; pct: number }
const SEG_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#14B8A6"];

export function RevenueBreakdownCard({ ticker }: { ticker: string }) {
  const [tab, setTab] = useState<"segment" | "geography">("segment");
  const [hover, setHover] = useState<number | null>(null);
  const { data, isLoading } = useSWR<{ segments: RevSeg[]; geography: RevSeg[]; total: number | null; asOf: string | null; form: string | null }>(
    `${API_BASE}/company-civic/revenue-segments?ticker=${ticker}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const hasGeo = (data?.geography?.length || 0) > 0;
  const rows = (tab === "geography" && hasGeo ? data?.geography : data?.segments) || [];
  const asOfQ = data?.asOf
    ? `Q${Math.floor(new Date(data.asOf).getUTCMonth() / 3) + 1} ${new Date(data.asOf).getUTCFullYear()} (${formatDate(data.asOf)})`
    : null;
  // No segment breakdown in the latest filing -> no card (typical for shells
  // and single-line-of-business micro-caps).
  if (!isLoading && !(data?.segments?.length || data?.geography?.length)) return null;
  return (
    <div className="card p-5 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center gap-2">
        <span className="text-accent"><TrendingUp className="h-4 w-4" /></span>
        <Link href="/revenue-breakdown" className="text-[16px] font-bold hover:text-accent transition">Revenue Breakdown →</Link>
      </div>
      <p className="text-[12px] text-mute mt-0.5 mb-3">{ticker} Revenue by Segment{hasGeo ? " or Geography" : ""}</p>
      {hasGeo && (
        <div className="flex gap-1.5 mb-3">
          {(["segment", "geography"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setHover(null); }}
              className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition"
              style={tab === t ? { background: "var(--accent)", color: "#fff" } : { background: "var(--bg-2)", color: "var(--text-mute)" }}>
              By {t === "segment" ? "Segment" : "Geography"}
            </button>
          ))}
        </div>
      )}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[12.5px] text-mute py-8">Reading latest SEC filing…</div>
      ) : rows.length === 0 ? (
        <Empty text={`${ticker}'s latest filing doesn't break out revenue by ${tab}.`} />
      ) : (
        <div className="flex flex-col gap-3 items-center flex-1 min-h-0">
          <RevenueDonut rows={rows} hover={hover} setHover={setHover}
            centerTop={hover != null && rows[hover] ? rows[hover].pct.toFixed(1) + "%" : formatCurrency(rows.reduce((s, r) => s + r.revenue, 0))}
            centerBottom={hover != null && rows[hover] ? rows[hover].name : "Total"} />
          <div className="w-full overflow-auto scrollbar-visible" style={{ maxHeight: 190 }}>
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 z-10" style={{ background: "var(--bg-2)" }}>
                <tr className="text-[10px] uppercase tracking-wider text-mute text-left">
                  <th className="font-bold px-2.5 py-1.5">{tab === "geography" ? "Region" : "Segment"}</th>
                  <th className="font-bold px-2.5 py-1.5 text-right">Revenue</th>
                  <th className="font-bold px-2.5 py-1.5 text-right">% of All</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                    style={{ borderTop: "1px solid var(--border)", background: hover === i ? "var(--bg-2)" : undefined, cursor: "default" }}>
                    <td className="px-2.5 py-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm mr-2 align-middle" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />
                      <span className="font-semibold align-middle">{s.name}</span>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular font-semibold whitespace-nowrap">{formatCurrency(s.revenue)}</td>
                    <td className="px-2.5 py-2 text-right tabular text-mute">{s.pct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-faint mt-2">{asOfQ ? `As of: ${asOfQ} · ` : ""}Source: SEC EDGAR ({data?.form || "10-Q/10-K"})</p>
    </div>
  );
}

/** Donut (circle) breakdown — hover a slice or table row to highlight. */
export function RevenueDonut({ rows, hover, setHover, centerTop, centerBottom }: {
  rows: RevSeg[]; hover: number | null; setHover: (i: number | null) => void; centerTop: string; centerBottom: string;
}) {
  const size = 190, cx = size / 2, cy = size / 2, R = 82, r = 52;
  const total = rows.reduce((s, x) => s + x.revenue, 0) || 1;
  let a0 = -Math.PI / 2;
  const arcs = rows.map((s, i) => {
    const frac = s.revenue / total;
    const a1 = a0 + frac * 2 * Math.PI;
    // Avoid a single 100% slice collapsing (same start/end point).
    const end = frac >= 0.9999 ? a1 - 0.0001 : a1;
    const large = end - a0 > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const d = `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(end, R)} L ${p(end, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
    a0 = a1;
    return { d, i };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {arcs.map((a) => (
        <path key={a.i} d={a.d} fill={SEG_COLORS[a.i % SEG_COLORS.length]}
          opacity={hover == null || hover === a.i ? 1 : 0.35}
          stroke="var(--bg-1)" strokeWidth="1.5" style={{ cursor: "pointer", transition: "opacity 120ms" }}
          onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--text)">{centerTop}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10.5" fill="var(--text-mute)">
        {centerBottom.length > 24 ? centerBottom.slice(0, 23) + "…" : centerBottom}
      </text>
    </svg>
  );
}

/** Whale Activity — recently reported 13F institutional positions. */
interface Whale { institution: string; shares: number; value: number; change: number | null; pctChange: number | null; isNew: boolean; reported: string }

export function WhaleActivityCard({ ticker, companyName }: { ticker: string; companyName: string }) {
  const { data, isLoading } = useSWR<{ holdings: Whale[] }>(
    `${API_BASE}/company-civic/whale-activity?ticker=${ticker}&name=${encodeURIComponent(companyName)}`,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const rows = data?.holdings || [];
  const counts = {
    increased: rows.filter((w) => !w.isNew && (w.change ?? 0) > 0).length,
    isNew: rows.filter((w) => w.isNew).length,
    held: rows.filter((w) => !w.isNew && w.change === 0).length,
    decreased: rows.filter((w) => (w.change ?? 0) < 0).length,
  };
  const known = counts.increased + counts.isNew + counts.held + counts.decreased;
  // No reported 13F positions -> hide the card entirely (client spec: thin
  // profiles shouldn't be a wall of empty boxes).
  if (!isLoading && known === 0) return null;
  return (
    <Card icon={<Landmark className="h-4 w-4" />} title="Whale Activity" href={`/companies/${encodeURIComponent(ticker)}/institutions`}
      subtitle={`Recently reported changes in ${ticker} holdings by institutional investors`}>
      {isLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Scanning latest 13F filings…</div>
      ) : known === 0 ? (
        <Empty text={`No recent 13F filings reporting ${ticker} positions found.`} />
      ) : (
        <div className="h-full flex items-center justify-center">
          <WhaleGauge segments={[
            { label: "New", count: counts.isNew, color: "#34D399" },
            { label: "Increased", count: counts.increased, color: "#10B981" },
            { label: "Held", count: counts.held, color: "#4E8E76" },
            { label: "Decreased", count: counts.decreased, color: "#C6505C" },
          ].filter((s) => s.count > 0)} />
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-faint">Latest {rows.length} 13F filings · Source: SEC EDGAR</p>
        <Link href={`/companies/${encodeURIComponent(ticker)}/institutions`} className="text-[11px] font-bold text-accent hover:underline">
          View all institutional owners →
        </Link>
      </div>
    </Card>
  );
}

/** QuiverQuant-style 270° arc gauge — one colored band per change category
 *  with the label + count rendered inside each slice. */
export function WhaleGauge({ segments }: { segments: { label: string; count: number; color: string }[] }) {
  const size = 290, cx = size / 2, cy = size / 2, R = 118, r = 66;
  const total = segments.reduce((s, x) => s + x.count, 0) || 1;
  // Sweep 270° clockwise starting at 7:30 (bottom-left), gap at the bottom —
  // angles measured clockwise from 12 o'clock.
  const START = 225, SWEEP = 270;
  const pt = (deg: number, rad: number) => {
    const a = (deg * Math.PI) / 180;
    return `${cx + rad * Math.sin(a)},${cy - rad * Math.cos(a)}`;
  };
  let a0 = START;
  const arcs = segments.map((s) => {
    const sweep = (s.count / total) * SWEEP;
    const a1 = a0 + sweep;
    const large = sweep > 180 ? 1 : 0;
    const d = `M ${pt(a0, R)} A ${R} ${R} 0 ${large} 1 ${pt(a1, R)} L ${pt(a1, r)} A ${r} ${r} 0 ${large} 0 ${pt(a0, r)} Z`;
    const mid = (a0 + a1) / 2;
    a0 = a1;
    return { ...s, d, mid, sweep };
  });
  const midR = (R + r) / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 280 }}>
      {arcs.map((a) => (
        <path key={a.label} d={a.d} fill={a.color} stroke="var(--bg-1)" strokeWidth="1" />
      ))}
      {arcs.map((a) => {
        const rad = (a.mid * Math.PI) / 180;
        // Clamp the label's x so its text box always stays inside the canvas,
        // even when a slice midpoint lands at the extreme left/right.
        const halfW = Math.max(a.label.length, String(a.count).length) * 11.5 * 0.31;
        const x = Math.min(size - halfW - 4, Math.max(halfW + 4, cx + midR * Math.sin(rad)));
        const y = cy - midR * Math.cos(rad);
        // Big slices: horizontal 2-line label. Small slices: rotated along the arc.
        if (a.sweep >= 34) {
          return (
            <g key={a.label}>
              <text x={x} y={y - 3.5} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#fff">{a.label}</text>
              <text x={x} y={y + 11.5} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#fff">{a.count}</text>
            </g>
          );
        }
        const rot = a.mid > 180 ? a.mid + 90 : a.mid - 90;
        return (
          <text key={a.label} x={x} y={y} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff"
            transform={`rotate(${rot} ${x} ${y})`}>
            {a.label} {a.count}
          </text>
        );
      })}
    </svg>
  );
}

/** AI Bull Case vs Bear Case — our own, generated from the ticker's data. */
export function BullBearCard({ ticker, companyName, sector, insiderScore }: { ticker: string; companyName: string; sector?: string | null; insiderScore?: number | null }) {
  const params = new URLSearchParams({ name: companyName });
  if (sector) params.set("sector", sector);
  if (insiderScore != null) params.set("score", String(Math.round(insiderScore)));
  const { data, isLoading } = useSWR<{ bullBear: { bull: string[]; bear: string[] } | null }>(
    `${API_BASE}/content/bull-bear/${ticker}?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 },
  );
  const bb = data?.bullBear;
  // Bull/bear talking points come from the LLM pipeline; when absent, hide
  // the card rather than pinning a permanent empty box on the profile.
  if (!isLoading && (!bb || (!bb.bull.length && !bb.bear.length))) return null;
  return (
    <div className="card p-5 flex flex-col h-full min-h-[320px] lg:col-span-2">
      <div className="flex items-center gap-2">
        <span className="text-accent"><Scale3d className="h-4 w-4" /></span>
        <h3 className="text-[16px] font-bold">Bull Case vs Bear Case</h3>
      </div>
      <p className="text-[12px] text-mute mt-0.5 mb-3">AI-generated from {ticker}&rsquo;s recent data — informational, not investment advice</p>
      {isLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Generating analysis…</div>
      ) : !bb || (!bb.bull.length && !bb.bear.length) ? (
        <div className="h-full flex items-center justify-center text-center text-[12.5px] text-mute py-8 px-4">AI analysis unavailable right now.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "#10B981" }}>▲ Bull Case</div>
            <ul className="space-y-2">
              {bb.bull.map((p, i) => (
                <li key={i} className="text-[13px] leading-relaxed flex gap-2">
                  <span style={{ color: "#10B981" }} className="flex-shrink-0">+</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "#EF4444" }}>▼ Bear Case</div>
            <ul className="space-y-2">
              {bb.bear.map((p, i) => (
                <li key={i} className="text-[13px] leading-relaxed flex gap-2">
                  <span style={{ color: "#EF4444" }} className="flex-shrink-0">−</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function Card({ icon, title, subtitle, href, children }: { icon: React.ReactNode; title: string; subtitle: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        {href ? (
          <Link href={href} className="text-[16px] font-bold hover:text-accent transition">{title} →</Link>
        ) : (
          <h3 className="text-[16px] font-bold">{title}</h3>
        )}
      </div>
      <p className="text-[12px] text-mute mt-0.5 mb-3">{subtitle}</p>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-center text-[12.5px] text-mute px-4 py-8">{text}</div>;
}

/** Congress Trading — recent trades of this ticker by members of Congress. */
export function CongressTradingCard({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ rows: any[] }>(`${API_BASE}/congressional-trades?ticker=${ticker}&limit=8`, fetcher, { revalidateOnFocus: false });
  const rows = data?.rows || [];
  // No congressional trades for this ticker -> no card.
  if (data && rows.length === 0) return null;
  return (
    <Card icon={<Landmark className="h-4 w-4" />} title="Congress Trading" subtitle={`Recent trades of ${ticker} by members of U.S. Congress`}>
      {rows.length === 0 ? null : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-mute" style={{ background: "var(--bg-2)" }}>
                <th className="text-left font-bold px-2.5 py-1.5">Politician</th>
                <th className="text-left font-bold px-2.5 py-1.5">Type</th>
                <th className="text-right font-bold px-2.5 py-1.5">Traded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-2.5 py-2">
                    <Link href={`/politicians/${encodeURIComponent(r.politicianName)}`} className="font-semibold hover:text-accent transition">{r.politicianName}</Link>
                    <span className="block text-[10px] text-mute">{r.chamber}{r.party ? ` / ${r.party}` : ""}</span>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-semibold" style={{ color: r.action === "Buy" ? "#10B981" : "#EF4444" }}>{r.action === "Buy" ? "Purchase" : "Sale"}</span>
                    <span className="block text-[10px] text-mute">{r.amountMin != null ? formatCurrency(r.amountMin) : ""}{r.amountMax != null && r.amountMax !== r.amountMin ? ` – ${formatCurrency(r.amountMax)}` : ""}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right text-mute whitespace-nowrap">{r.transactionDate ? formatDate(r.transactionDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Government Contracts — quarterly federal contract $ awarded (USAspending). */
export function GovContractsCard({ companyName, ticker }: { companyName: string; ticker: string }) {
  const { data } = useSWR<{ quarters: { label: string; amount: number }[] }>(
    `${API_BASE}/company-civic/contracts?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false });
  const q = (data?.quarters || []).slice(-12);
  return (
    <Card icon={<FileText className="h-4 w-4" />} title="Government Contracts" subtitle={`Quarterly federal contracts awarded to ${ticker}`}>
      {q.length === 0 ? <Empty text={`No recent federal contracts for ${ticker}.`} /> : <CivicBars data={q} color="#6366F1" />}
      <p className="text-[10px] text-faint mt-2">Source: USAspending.gov</p>
    </Card>
  );
}

/** Corporate Lobbying — quarterly lobbying spend (Senate LDA; needs key). */
export function LobbyingCard({ companyName, ticker }: { companyName: string; ticker: string }) {
  const { data } = useSWR<{ quarters: { label: string; amount: number }[]; enabled: boolean }>(
    `${API_BASE}/company-civic/lobbying?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false });
  const q = (data?.quarters || []).slice(-12);
  return (
    <Card icon={<Scale className="h-4 w-4" />} title="Corporate Lobbying" subtitle={`Estimated quarterly lobbying spend by ${ticker}`}>
      {q.length === 0 ? (
        <Empty text={data && !data.enabled ? "Lobbying data activates once an LDA_API_KEY (free, Senate LDA) is set." : `No lobbying filings found for ${ticker}.`} />
      ) : <CivicBars data={q} color="#8B5CF6" />}
      <p className="text-[10px] text-faint mt-2">Source: U.S. Senate LDA</p>
    </Card>
  );
}

function axisMoney(n: number): string {
  const a = Math.abs(n);
  return a >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${Math.round(n / 1e6)}M` : a >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
}

/** Bar chart with a Y-axis (nice ticks + gridlines), angled X labels, and an
 *  interactive hover tooltip. `signed` = green(+)/red(−) around a zero line. */
export function CivicBars({ data, color = "#6366F1", signed = false }: { data: { label: string; amount: number }[]; color?: string; signed?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 210, mL = 52, mR = 8, mT = 10, mB = 42;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const rawMax = Math.max(1, ...data.map((d) => Math.abs(d.amount)));
  const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / pow) * pow;
  const groupW = plotW / data.length;
  const barW = Math.min(20, groupW * 0.6);
  const zeroY = signed ? mT + plotH / 2 : mT + plotH;
  const scale = signed ? plotH / 2 / max : plotH / max;
  const ticks = signed ? [max, max / 2, 0, -max / 2, -max] : [max, max * 0.75, max * 0.5, max * 0.25, 0];
  const tickY = (t: number) => (signed ? zeroY - t * scale : zeroY - t * scale);

  return (
    <div className="relative">
      {hover != null && data[hover] && (
        <div className="absolute z-10 text-[11px] rounded px-2 py-1 pointer-events-none whitespace-nowrap"
          style={{ left: `${(mL + groupW * (hover + 0.5)) / W * 100}%`, top: 0, transform: "translateX(-50%)", background: "var(--text)", color: "var(--bg-1)" }}>
          {data[hover].label}: {formatCurrency(data[hover].amount)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        {/* Y gridlines + tick labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={mL} x2={W - mR} y1={tickY(t)} y2={tickY(t)} stroke="var(--border)" strokeWidth="1" opacity="0.5" />
            <text x={mL - 8} y={tickY(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-mute)">{axisMoney(t)}</text>
          </g>
        ))}
        {/* Axis lines */}
        <line x1={mL} x2={mL} y1={mT} y2={mT + plotH} stroke="var(--border-strong)" strokeWidth="1.5" />
        <line x1={mL} x2={W - mR} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1.5" />
        {data.map((d, i) => {
          const cx = mL + groupW * (i + 0.5);
          const h = Math.abs(d.amount) * scale;
          const up = d.amount >= 0;
          const y = signed ? (up ? zeroY - h : zeroY) : zeroY - h;
          const fill = signed ? (up ? "#10B981" : "#EF4444") : color;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              {/* wide invisible hit area so hover is easy */}
              <rect x={mL + groupW * i} y={mT} width={groupW} height={plotH} fill="transparent" />
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(1, h)} rx="2" fill={fill} opacity={hover == null || hover === i ? 1 : 0.55} />
              <text x={cx} y={H - mB + 14} textAnchor="end" fontSize="9.5" fill="var(--text-mute)" transform={`rotate(-40 ${cx} ${H - mB + 14})`}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
