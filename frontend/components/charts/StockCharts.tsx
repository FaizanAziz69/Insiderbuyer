"use client";
import { useMemo, useRef, useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/api";

/** QuiverQuant-style charts for the 9-tab stock profile. All hand-rolled SVG,
 *  theme-token colored, with hover value readouts. */

function Tip({ children, leftPct }: { children: React.ReactNode; leftPct: number }) {
  return (
    <div className="absolute z-10 text-[11.5px] rounded px-2 py-1 pointer-events-none whitespace-nowrap font-semibold"
      style={{ left: `${Math.min(86, Math.max(14, leftPct))}%`, top: -4, transform: "translateX(-50%)", background: "var(--text)", color: "var(--bg-1)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
      {children}
    </div>
  );
}

function nice(n: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, n))));
  return Math.ceil(n / pow) * pow;
}
function axisNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${Math.round(n)}`;
}

/** Stacked-by-quarter yearly bars (Lobbying / Gov Contracts) with a Q1–Q4
 *  legend and a Y-axis title, exactly like the reference. */
export function StackedYearBars({ data, base, yLabel }: {
  data: { year: number; q: (number | null)[] }[]; // q[0]=Q1 … q[3]=Q4
  base: string; // base color token/hex
  yLabel: string;
}) {
  const [hover, setHover] = useState<{ y: number; qi: number } | null>(null);
  const W = 560, H = 250, mL = 64, mR = 56, mT = 12, mB = 34;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const totals = data.map((d) => d.q.reduce((s: number, v) => s + (v || 0), 0));
  const max = nice(Math.max(1, ...totals));
  const groupW = plotW / Math.max(1, data.length);
  const barW = Math.min(38, groupW * 0.55);
  const yBase = mT + plotH;
  const SH = [0.45, 0.62, 0.8, 1]; // Q1 lightest → Q4 solid
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => max * f);
  const hovered = hover ? data.find((d) => d.year === hover.y) : null;
  return (
    <div className="relative">
      {hover && hovered && (
        <Tip leftPct={((mL + groupW * (data.indexOf(hovered) + 0.5)) / W) * 100}>
          {hovered.year} Q{hover.qi + 1} · {formatCurrency(hovered.q[hover.qi] || 0)}
          {" — year "}{formatCurrency(totals[data.indexOf(hovered)])}
        </Tip>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        <text x={14} y={mT + plotH / 2} textAnchor="middle" fontSize="10.5" fill="var(--text-mute)"
          transform={`rotate(-90 14 ${mT + plotH / 2})`}>{yLabel}</text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={mL} x2={W - mR} y1={yBase - (t / max) * plotH} y2={yBase - (t / max) * plotH} stroke="var(--border)" strokeWidth="1" opacity="0.45" />
            <text x={mL - 7} y={yBase - (t / max) * plotH + 3.5} textAnchor="end" fontSize="10" fill="var(--text-mute)">{axisNum(t)}</text>
          </g>
        ))}
        <line x1={mL} x2={W - mR} y1={yBase} y2={yBase} stroke="var(--border-strong)" strokeWidth="1.5" />
        {data.map((d, i) => {
          const cx = mL + groupW * (i + 0.5);
          let acc = 0;
          return (
            <g key={d.year}>
              {d.q.map((v, qi) => {
                if (!v || v <= 0) return null;
                const h = (v / max) * plotH;
                const y = yBase - ((acc + v) / max) * plotH;
                acc += v;
                const dim = hover && !(hover.y === d.year && hover.qi === qi);
                return (
                  <rect key={qi} x={cx - barW / 2} y={y} width={barW} height={Math.max(1, h)}
                    fill={base} opacity={dim ? SH[qi] * 0.5 : SH[qi]}
                    onMouseEnter={() => setHover({ y: d.year, qi })} onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer", transition: "opacity 100ms" }} />
                );
              })}
              <text x={cx} y={yBase + 15} textAnchor="middle" fontSize="11" fill="var(--text-mute)">{d.year}</text>
            </g>
          );
        })}
        {/* Q legend (Q4 on top, like the reference) */}
        {[3, 2, 1, 0].map((qi, i) => (
          <g key={qi} transform={`translate(${W - mR + 14}, ${mT + 8 + i * 20})`}>
            <rect width="11" height="11" rx="2" fill={base} opacity={SH[qi]} />
            <text x={16} y={9.5} fontSize="10.5" fill="var(--text-mute)">Q{qi + 1}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Quarterly NET shares purchased by insiders — bars hang below the zero
 *  line when negative; missing quarters render as labeled gaps. */
export function NetSharesBars({ data }: { data: { label: string; value: number | null }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 250, mL = 66, mR = 12, mT = 12, mB = 34;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const vals = data.map((d) => Math.abs(d.value ?? 0));
  const max = nice(Math.max(1, ...vals));
  const zeroY = data.some((d) => (d.value ?? 0) < 0) && data.every((d) => (d.value ?? 0) <= 0)
    ? mT + 8 // all-negative: zero line near the top, like the reference
    : mT + plotH / 2;
  const scale = (plotH - (zeroY - mT)) / max; // room below zero
  const upScale = (zeroY - mT) / max; // room above zero
  const groupW = plotW / Math.max(1, data.length);
  const barW = Math.min(56, groupW * 0.55);
  return (
    <div className="relative">
      {hover != null && data[hover] && data[hover].value != null && (
        <Tip leftPct={((mL + groupW * (hover + 0.5)) / W) * 100}>
          {data[hover].label} ·{" "}
          <span style={{ color: (data[hover].value as number) >= 0 ? "#34D399" : "#F87171" }}>
            {formatNumber(data[hover].value as number)}
          </span>{" "}
          net shares
        </Tip>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        <text x={14} y={mT + plotH / 2} textAnchor="middle" fontSize="10.5" fill="var(--text-mute)"
          transform={`rotate(-90 14 ${mT + plotH / 2})`}>Net Shares Purchased by Insiders</text>
        {[-1, -0.5, 0].map((f) => {
          const y = zeroY - f * max * scale * -1; // negative ticks below zero
          const v = f * max;
          if (y > mT + plotH + 1) return null;
          return (
            <g key={f}>
              <line x1={mL} x2={W - mR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" opacity="0.45" />
              <text x={mL - 7} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--text-mute)">{v === 0 ? "0" : `−${axisNum(Math.abs(v))}`}</text>
            </g>
          );
        })}
        <line x1={mL} x2={W - mR} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1.5" />
        {data.map((d, i) => {
          const cx = mL + groupW * (i + 0.5);
          if (d.value == null) {
            return <text key={d.label} x={cx} y={mT + plotH + 15} textAnchor="middle" fontSize="10.5" fill="var(--text-mute)">{d.label}</text>;
          }
          const up = d.value >= 0;
          const h = Math.abs(d.value) * (up ? upScale : scale);
          const y = up ? zeroY - h : zeroY;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={mL + groupW * i} y={mT} width={groupW} height={plotH} fill="transparent" />
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(1.5, h)} rx="2"
                fill={up ? "var(--good)" : "var(--bad)"} opacity={hover == null || hover === i ? 0.9 : 0.45} />
              <text x={cx} y={mT + plotH + 15} textAnchor="middle" fontSize="10.5" fill="var(--text-mute)">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Multi-year closing-price line with buy/sell bubbles sized by trade value —
 *  the Insiders-tab hero chart. */
export function PriceBubbleChart({ history, trades }: {
  history: { date: string; close: number }[];
  trades: { date: string; value: number; isBuy: boolean; insider: string; shares: number; price: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 980, H = 320, mL = 10, mR = 56, mT = 16, mB = 30;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const { pts, bubbles, yMax, yMin, years } = useMemo(() => {
    const hs = history.filter((h) => h.close > 0);
    if (hs.length < 2) return { pts: "", bubbles: [] as any[], yMax: 1, yMin: 0, years: [] as { x: number; label: number }[] };
    const t0 = new Date(hs[0].date).getTime(), t1 = new Date(hs[hs.length - 1].date).getTime();
    const closes = hs.map((h) => h.close);
    const yMaxV = Math.max(...closes) * 1.05, yMinV = Math.min(...closes) * 0.92;
    const x = (t: number) => mL + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
    const y = (v: number) => mT + (1 - (v - yMinV) / (yMaxV - yMinV)) * plotH;
    const pts = hs.map((h) => `${x(new Date(h.date).getTime()).toFixed(1)},${y(h.close).toFixed(1)}`).join(" L ");
    const maxV = Math.max(1, ...trades.map((t) => t.value));
    const bubbles = trades
      .map((t) => {
        const tt = new Date(t.date).getTime();
        if (!(tt >= t0 && tt <= t1)) return null;
        // nearest close for y
        let lo = 0, hi = hs.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; (new Date(hs[mid].date).getTime() <= tt) ? (lo = mid) : (hi = mid); }
        return { cx: x(tt), cy: y(hs[lo].close), r: 4 + Math.sqrt(t.value / maxV) * 14, t };
      })
      .filter(Boolean) as { cx: number; cy: number; r: number; t: (typeof trades)[number] }[];
    const years: { x: number; label: number }[] = [];
    const y0 = new Date(hs[0].date).getUTCFullYear(), y1 = new Date(hs[hs.length - 1].date).getUTCFullYear();
    for (let yr = y0; yr <= y1; yr++) {
      const tx = new Date(Date.UTC(yr, 0, 1)).getTime();
      if (tx >= t0 && tx <= t1) years.push({ x: x(tx), label: yr });
    }
    return { pts: `M ${pts}`, bubbles, yMax: yMaxV, yMin: yMinV, years };
  }, [history, trades]);
  if (!pts) return <p className="text-mute text-sm py-8 text-center">Not enough price history.</p>;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const b = hover != null ? bubbles[hover] : null;
  return (
    <div className="relative">
      <div className="flex items-center justify-center gap-5 text-[11.5px] text-mute mb-1">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 h-[2px]" style={{ background: "var(--text-mute)" }} /> Closing Price</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--good)" }} /> Purchase</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--bad)" }} /> Sale</span>
      </div>
      {b && (
        <Tip leftPct={(b.cx / W) * 100}>
          {b.t.insider} · {b.t.isBuy ? "Purchase" : "Sale"} · {formatNumber(b.t.shares)} sh @ ${b.t.price.toFixed(2)} ({formatCurrency(b.t.value)})
        </Tip>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        {yTicks.map((t) => {
          const y = mT + (1 - (t - yMin) / (yMax - yMin)) * plotH;
          return (
            <g key={t}>
              <line x1={mL} x2={W - mR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" opacity="0.4" />
              <text x={W - mR + 6} y={y + 3.5} fontSize="10.5" fill="var(--text-mute)">{t.toFixed(2)}</text>
            </g>
          );
        })}
        {years.map((yr) => (
          <text key={yr.label} x={yr.x} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-mute)">{yr.label}</text>
        ))}
        <path d={pts} fill="none" stroke="var(--text-mute)" strokeWidth="1.4" />
        {bubbles.map((bb, i) => (
          <circle key={i} cx={bb.cx} cy={bb.cy} r={bb.r}
            fill={bb.t.isBuy ? "var(--good)" : "var(--bad)"} opacity={hover == null || hover === i ? 0.75 : 0.3}
            stroke="var(--bg-1)" strokeWidth="1"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer", transition: "opacity 100ms" }} />
        ))}
      </svg>
    </div>
  );
}

/** Squarified treemap of institutional owners: area = shares, color = change
 *  direction (good → bad through neutral), tail grouped into "Other". */
export function InstitutionsTreemap({ rows }: {
  rows: { institution: string; shares: number; value: number; pctChange: number | null; isNew: boolean }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 980, H = 430;
  const tiles = useMemo(() => {
    // Largest positions first — otherwise a giant filer that happened to file
    // later lands in "Other" and swallows the whole map.
    const sorted = rows.slice().sort((a, b) => b.shares - a.shares);
    const top = sorted.slice(0, 18);
    const otherShares = sorted.slice(18).reduce((s, r) => s + r.shares, 0);
    const rest = sorted.slice(18);
    const items = [
      ...top.map((r) => ({ ...r, label: r.institution })),
      ...(otherShares > 0
        ? [{ institution: "Other", label: "Other", shares: otherShares, value: rows.slice(18).reduce((s, r) => s + r.value, 0), pctChange: null as number | null, isNew: false }]
        : []),
    ].filter((r) => r.shares > 0);
    const total = items.reduce((s, r) => s + r.shares, 0) || 1;
    // simple slice-and-dice squarify-ish: recursive split of the best row
    type T = { x: number; y: number; w: number; h: number; item: (typeof items)[number] };
    const out: T[] = [];
    const layout = (list: typeof items, x: number, y: number, w: number, h: number) => {
      if (!list.length) return;
      if (list.length === 1) { out.push({ x, y, w, h, item: list[0] }); return; }
      const sum = list.reduce((s, r) => s + r.shares, 0) || 1;
      let acc = 0, i = 0;
      while (i < list.length - 1 && acc + list[i].shares < sum / 2) { acc += list[i].shares; i++; }
      const first = list.slice(0, Math.max(1, i)), rest = list.slice(Math.max(1, i));
      const frac = first.reduce((s, r) => s + r.shares, 0) / sum;
      if (w >= h) {
        layout(first, x, y, w * frac, h);
        layout(rest, x + w * frac, y, w * (1 - frac), h);
      } else {
        layout(first, x, y, w, h * frac);
        layout(rest, x, y + h * frac, w, h * (1 - frac));
      }
    };
    layout(items, 0, 0, W, H);
    return out.map((t) => ({ ...t, pct: t.item.shares / total }));
  }, [rows]);
  const fill = (r: { pctChange: number | null; isNew: boolean; institution: string }) => {
    if (r.institution === "Other") return "var(--bg-3)";
    if (r.isNew) return "color-mix(in srgb, var(--good) 55%, var(--bg-2))";
    const c = r.pctChange;
    if (c == null || Math.abs(c) < 0.5) return "color-mix(in srgb, var(--text-mute) 22%, var(--bg-2))";
    const mag = Math.min(60, 25 + Math.abs(c) * 2.5);
    return c > 0
      ? `color-mix(in srgb, var(--good) ${mag}%, var(--bg-2))`
      : `color-mix(in srgb, var(--bad) ${mag}%, var(--bg-2))`;
  };
  const h = hover != null ? tiles[hover] : null;
  return (
    <div className="relative">
      {h && (
        <Tip leftPct={((h.x + h.w / 2) / W) * 100}>
          {h.item.institution} · {formatNumber(h.item.shares)} sh · {formatCurrency(h.item.value)}
          {h.item.isNew ? (
            " · NEW"
          ) : h.item.pctChange != null ? (
            <>
              {" · "}
              <span style={{ color: h.item.pctChange >= 0 ? "#34D399" : "#F87171" }}>
                {h.item.pctChange >= 0 ? "+" : ""}
                {h.item.pctChange}%
              </span>
            </>
          ) : (
            ""
          )}
        </Tip>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {tiles.map((t, i) => {
          const fs = Math.max(0, Math.min(15, Math.sqrt(t.w * t.h) / 7));
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx="3"
                fill={fill(t.item)} stroke="var(--bg-1)" strokeWidth="1.5" opacity={hover == null || hover === i ? 1 : 0.55} />
              {fs >= 8 && t.w > 46 && (
                <text x={t.x + 8} y={t.y + 8 + fs} fontSize={fs} fontWeight="700" fill="var(--text)">
                  {t.item.label.length > t.w / (fs * 0.62) ? t.item.label.slice(0, Math.max(3, Math.floor(t.w / (fs * 0.62))) - 1) + "…" : t.item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
