"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { VizSkeleton } from "./VizFrame";

/**
 * §7 viz 9 — "since listing" share-price cards.
 *
 * WHY THIS EXISTS. An article that compares two or three companies over their
 * whole listed life had two options before this, and neither worked. A stack
 * of `price-chart` blocks is three full-bleed charts with three frames, which
 * reads as three separate exhibits rather than one comparison, and it is
 * capped at the range the caller passes. A `peer-table` gets the numbers into
 * one exhibit but throws away the shape of the move, which for a
 * "what this business model has paid shareholders" claim IS the evidence
 * (client, 2026-09-22: "I want the stock charts in there instead with the
 * arrow graphic and %ROI").
 *
 * So: one module, one block per company, each with the full price history from
 * listing, the headline return, and a trend arrow along the move. Unframed
 * since 2026-09-24 at the client's request: no shell, no per-company card, the
 * charts sit straight on the page.
 *
 * WHAT IS LIVE AND WHAT IS SUPPLIED. The curve, the latest price and therefore
 * the return are pulled at render from our own market data, so this module
 * cannot go stale and cannot contradict the rest of the site. Only the split-
 * adjusted listing price is writer-supplied, because our history starts at the
 * first month-end close after a listing rather than at the offer itself, and
 * for a 1995 IPO the difference is large enough to matter to the multiple.
 * That is also the safeguard that caught a stale figure on first use: the deck
 * this ran from priced Dollar Tree at US$118.66, the feed said US$112.33, and
 * the return quietly corrected from 109x to 103x.
 *
 * The writer supplies one pipe-delimited row per line inside the placeholder:
 *
 *   <div data-viz="since-listing" data-title="…" data-source="…">
 *   DOL.TO | Dollarama | TSX: DOL · Canada | 2.81 | C$ | October 2009
 *   DLTR   | Dollar Tree | NASDAQ: DLTR · United States | 1.09 | US$ | March 1995
 *   </div>
 *
 * symbol | display name | exchange line | split-adjusted listing price |
 * currency prefix | listing month and year.
 */

interface Bar {
  date: string;
  close: number;
}

interface RowSpec {
  symbol: string;
  name: string;
  label: string;
  listPrice: number;
  currency: string;
  listed: string;
}

/** Parse the writer's pipe rows. A malformed line is dropped, not rendered. */
export function parseRows(inner: string): RowSpec[] {
  const out: RowSpec[] = [];
  for (const raw of (inner || "").split("\n")) {
    const line = raw.replace(/<[^>]*>/g, "").trim();
    if (!line || !line.includes("|")) continue;
    const p = line.split("|").map((s) => s.trim());
    if (p.length < 6) continue;
    const listPrice = Number(p[3]);
    if (!p[0] || !Number.isFinite(listPrice) || listPrice <= 0) continue;
    out.push({
      symbol: p[0].toUpperCase(),
      name: p[1],
      label: p[2],
      listPrice,
      currency: p[4] || "$",
      listed: p[5],
    });
  }
  return out;
}

/** "About 64x" / "About 5.8x" — one decimal only while it still reads as one. */
function multiple(x: number): string {
  if (x >= 100) return `${Math.round(x)}x`;
  if (x >= 10) return `${x.toFixed(0)}x`;
  return `${x.toFixed(1)}x`;
}

function pct(v: number): string {
  const n = Math.round(v);
  return `${n >= 0 ? "+" : ""}${n.toLocaleString("en-US")}%`;
}

function money(currency: string, v: number): string {
  return `${currency}${v.toFixed(2)}`;
}

function yearOf(iso: string): string {
  return (iso || "").slice(0, 4);
}

/** One company: the card, its chart and its caption. */
function Card({ spec }: { spec: RowSpec }) {
  const { data, isLoading } = useSWR<{ history: { bars: Bar[] } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(spec.symbol)}&range=max`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );
  const bars = data?.history?.bars || [];

  const geo = useMemo(() => {
    if (bars.length < 3) return null;
    // Geometry matches the rest of the article furniture: a 640x220 board, a
    // baseline the area sits on, room on the right for the price label and a
    // strip at the bottom for the year ticks.
    const W = 640;
    const H = 220;
    const L = 14;
    const R = 544; // the plot ends here; 544..640 is the price label
    const BASE = 194;
    const TOP = 26;
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const rng = max - min || 1;
    const x = (i: number) => L + ((R - L) * i) / (closes.length - 1);
    const y = (c: number) => TOP + (BASE - TOP) * (1 - (c - min) / rng);
    const pts = closes.map((c, i) => ({ x: x(i), y: y(c) }));
    const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const last = closes[closes.length - 1];
    // The annotation arrow runs along the move but stops at 78% of it: past
    // that it collides with the closing dot and the price label, which is
    // exactly the interference the client asked us to remove.
    const a0 = { x: pts[0].x + 6, y: Math.min(BASE - 6, pts[0].y + 10) };
    const aEnd = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y + 12 };
    const T = 0.78;
    return {
      W, H, L, R, BASE,
      arrow: {
        x1: a0.x,
        y1: a0.y,
        x2: a0.x + (aEnd.x - a0.x) * T,
        y2: a0.y + (aEnd.y - a0.y) * T,
      },
      poly,
      area: `M ${L},${BASE} L ${poly.split(" ").join(" L ")} L ${R},${BASE} Z`,
      first: pts[0],
      lastPoint: pts[pts.length - 1],
      last,
      midIndex: Math.floor(closes.length / 2),
      mid: pts[Math.floor(closes.length / 2)],
    };
  }, [bars]);

  if (isLoading && bars.length === 0) return <VizSkeleton height={300} />;
  if (!geo) return null;

  // The return is measured from the writer's split-adjusted listing price to
  // the live close, which is the claim the caption makes in words.
  const growth = geo.last / spec.listPrice;
  const changePct = (growth - 1) * 100;
  const up = changePct >= 0;
  const line = up ? "var(--good)" : "var(--bad)";
  // The trend arrow is an annotation, not a series, so it does NOT take the
  // red/green semantics: a red arrow climbing across a green chart reads as a
  // loss to anyone who scans finance charts for colour first. It is drawn in
  // the body ink (client, 2026-09-24: "simple black arrows that dont
  // interfere with the chart") — thin, slightly softened and stopped short of
  // the last close, so it sits behind the price line rather than competing
  // with it. `--text` rather than literal black so it inverts with the theme.
  const arrow = "var(--text)";
  const gid = `sl-fill-${spec.symbol.replace(/[^A-Za-z0-9]/g, "")}`;
  const mid = `sl-head-${spec.symbol.replace(/[^A-Za-z0-9]/g, "")}`;

  return (
    // No card: the chart sits directly on the page (client, 2026-09-24 —
    // "get rid of the outer boxes and borders … just put the charts clean on
    // the white background"). Companies are separated by space alone.
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 mb-1.5">
        <div>
          <p className="text-[15.5px] font-bold leading-tight" style={{ color: "var(--text)" }}>
            {spec.name}
          </p>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-mute)" }}>
            {spec.label}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[17px] font-extrabold leading-tight" style={{ color: line }}>
            <span aria-hidden="true">{up ? "▲" : "▼"}</span> {pct(changePct)}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>
            since its {spec.listed} listing
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${geo.W} ${geo.H}`}
        width="100%"
        height={200}
        role="img"
        aria-label={`${spec.name} share price from its ${spec.listed} listing to today, ${pct(changePct)}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={line} stopOpacity="0.28" />
            <stop offset="100%" stopColor={line} stopOpacity="0" />
          </linearGradient>
          <marker
            id={mid}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={arrow} fillOpacity="0.65" />
          </marker>
        </defs>

        <line
          x1={geo.L}
          y1={geo.BASE}
          x2={geo.R}
          y2={geo.BASE}
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path d={geo.area} fill={`url(#${gid})`} />
        <polyline
          points={geo.poly}
          fill="none"
          stroke={line}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The trend arrow: a thin annotation along the move, stopped at 78%
            of the span so its head lands inside the chart and never reaches
            the closing dot, the price label or the right edge. */}
        <line
          x1={geo.arrow.x1}
          y1={geo.arrow.y1}
          x2={geo.arrow.x2}
          y2={geo.arrow.y2}
          stroke={arrow}
          strokeOpacity="0.65"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          markerEnd={`url(#${mid})`}
        />

        <circle cx={geo.first.x} cy={geo.first.y} r="4" fill="var(--text-mute)" />
        <circle cx={geo.lastPoint.x} cy={geo.lastPoint.y} r="5" fill={line} />
        <text
          x={geo.lastPoint.x + 10}
          y={geo.lastPoint.y + 4}
          fontSize="13"
          fontWeight="700"
          fill="var(--text)"
        >
          {money(spec.currency, geo.last)}
        </text>

        <text x={geo.first.x} y="212" textAnchor="middle" fontSize="11" fill="var(--text-mute)">
          {yearOf(bars[0].date)}
        </text>
        <text x={geo.mid.x} y="212" textAnchor="middle" fontSize="11" fill="var(--text-mute)">
          {yearOf(bars[geo.midIndex].date)}
        </text>
        <text x={geo.R} y="212" textAnchor="middle" fontSize="11" fill="var(--text-mute)">
          Now
        </text>
      </svg>

      <p className="text-[12px] leading-relaxed mt-1" style={{ color: "var(--text-mute)" }}>
        From a split-adjusted {money(spec.currency, spec.listPrice)} at its {spec.listed} listing to{" "}
        {money(spec.currency, geo.last)} today. About{" "}
        <strong style={{ color: "var(--text)" }}>{multiple(growth)}</strong> the money.
      </p>
    </div>
  );
}

export function SinceListingViz({
  html,
  title,
  subtitle,
  source,
  note,
}: {
  html: string;
  title?: string | null;
  subtitle?: string | null;
  source?: string | null;
  note?: string | null;
}) {
  const specs = useMemo(() => parseRows(html), [html]);
  if (specs.length === 0) return null;
  // Deliberately NOT VizFrame. Every other viz keeps the navy band and the
  // ruled shell, but the client asked for these charts unframed (2026-09-24):
  // the title and the source line stay, as plain type on the page, because the
  // manual still requires the attribution — it is the boxes that go.
  return (
    <figure className="my-8 not-prose">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--text)" }}
        >
          {title || "Share price since listing"}
        </span>
        {subtitle ? (
          <span className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
            {subtitle}
          </span>
        ) : null}
      </div>

      <div className="grid gap-8">
        {specs.map((s) => (
          <Card key={s.symbol} spec={s} />
        ))}
      </div>

      {(source || note) && (
        <figcaption className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--text-mute)" }}>
          {note ? <span className="block mb-1">{note}</span> : null}
          {source ? <span>Source: {source}</span> : null}
        </figcaption>
      )}
    </figure>
  );
}
