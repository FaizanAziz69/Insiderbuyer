"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useState } from "react";

/**
 * Workstream F §2.5 — the "standard data-article chart module on top" of the
 * ranking page: a ranked horizontal bar chart of disclosed IR spend.
 *
 * Form: magnitude across named entities with long labels ⇒ horizontal bars,
 * ranked, one series. One series means no legend (the title names it) and one
 * hue — the site accent — so nothing here encodes a judgement about the
 * companies, which §2.6 leaves unsettled. Marks are thin with 4px rounded
 * data-ends anchored to a common baseline, a 2px surface gap between bars,
 * recessive axis, and the value direct-labelled at the end of each bar rather
 * than on a second axis.
 *
 * Both themes come from the site's own tokens (`--accent`, `--text`,
 * `--panel`, `--border`), so dark mode is the design system's chosen step
 * rather than an automatic flip.
 *
 * Paygate (George 2026-09-21, "paygate this as well plz"): the caller already
 * passes DECOY tickers when `locked` (the real ones never enter the DOM), but
 * a decoy label with no lock cue reads as free data — George saw NRVX and
 * CBLT on his phone and took them for real, ungated issuers. So a locked
 * chart now says so: the labels are blurred with the gold lock glyph, the
 * same treatment as MaskedCell in the table beneath, every bar links to the
 * subscribe page, and the footer names what the unlock buys.
 */

interface Row {
  ticker: string;
  name: string | null;
  spendCad: number | null;
  activeContracts: number;
  sector: string | null;
}

const ROW_H = 26;
const GAP = 2;
const LABEL_W = 116;
const VALUE_W = 74;

function money(v: number): string {
  if (v >= 1e6) return `C$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e3) return `C$${(v / 1e3).toFixed(0)}K`;
  return `C$${Math.round(v)}`;
}

export function PromoterSpendChart({
  rows,
  loading,
  quarter,
  locked = false,
}: {
  rows: Row[];
  loading?: boolean;
  quarter?: string;
  /** Paygated view: the caller passes decoy tickers/names in `rows`; the
   *  tooltip link then points at the subscribe page, not a decoy URL. */
  locked?: boolean;
}) {
  // George 2026-09-21: this dataset is opened by a reviewed request, not a
  // subscription, so every locked affordance points at the form on the page.
  const REQUEST_HREF = "#request-access";
  const [hover, setHover] = useState<number | null>(null);
  const router = useRouter();
  const data = rows.filter((r) => (r.spendCad ?? 0) > 0).slice(0, 12);

  if (loading) {
    return (
      <div
        className="rounded-lg p-4 text-[13px]"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-mute)" }}
      >
        Loading disclosed spend…
      </div>
    );
  }
  if (!data.length) {
    return (
      <div
        className="rounded-lg p-4 text-[13px]"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-mute)" }}
      >
        No disclosed IR spend recorded for this quarter yet.
      </div>
    );
  }

  const max = Math.max(...data.map((r) => r.spendCad || 0));
  const height = data.length * (ROW_H + GAP) - GAP;
  const width = 860;
  const plotW = width - LABEL_W - VALUE_W;
  // Recessive gridlines at quarter steps of the maximum.
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => ({ f, v: max * f }));

  return (
    <figure className="rounded-lg p-4 m-0" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <figcaption className="mb-3">
        <h2 className="text-[15px] font-bold leading-tight" style={{ color: "var(--text)" }}>
          Biggest disclosed IR spenders{quarter ? ` · ${quarter}` : ""}
        </h2>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mute)" }}>
          Cash fees payable under disclosed investor-relations agreements this quarter, in Canadian dollars.
        </p>
      </figcaption>

      <div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={`Ranked bar chart of disclosed investor relations spend for the top ${data.length} Canadian venture issuers`}
          style={{ display: "block", width: "100%", height: "auto" }}
        >
          {ticks.map((t) => (
            <line
              key={t.f}
              x1={LABEL_W + plotW * t.f}
              x2={LABEL_W + plotW * t.f}
              y1={0}
              y2={height}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.55}
            />
          ))}

          {data.map((r, i) => {
            const y = i * (ROW_H + GAP);
            const w = Math.max(3, (plotW * (r.spendCad || 0)) / max);
            const on = hover === i;
            return (
              <g
                key={r.ticker}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(locked ? REQUEST_HREF : `/promoter-score/${r.ticker}`)}
                style={{ cursor: "pointer" }}
              >
                {/* Hit target spans the whole row, not just the bar. */}
                <rect x={0} y={y} width={width} height={ROW_H} fill="transparent" />
                <text
                  x={LABEL_W - 8}
                  y={y + ROW_H / 2 + 4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={700}
                  fill="var(--text)"
                  style={locked ? { filter: "blur(4px)", userSelect: "none" } : undefined}
                  aria-hidden={locked || undefined}
                >
                  {r.ticker}
                </text>
                {locked ? (
                  /* Same gold padlock MaskedCell draws over a locked cell. */
                  <svg
                    x={LABEL_W - 8 - 30}
                    y={y + ROW_H / 2 - 6}
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--premium)"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : null}
                <rect
                  x={LABEL_W}
                  y={y + 4}
                  width={w}
                  height={ROW_H - 8}
                  rx={4}
                  fill="var(--accent)"
                  opacity={on ? 1 : 0.82}
                />
                <text
                  x={LABEL_W + w + 8}
                  y={y + ROW_H / 2 + 4}
                  fontSize={11.5}
                  fontWeight={600}
                  fill="var(--text-soft)"
                >
                  {money(r.spendCad || 0)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hover != null && data[hover] ? (
        <div
          className="mt-2 rounded-md px-3 py-2 text-[12px]"
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
        >
          {locked ? (
            <Link href={REQUEST_HREF} className="font-bold hover:underline" style={{ color: "var(--premium)" }}>
              <Lock className="inline-block h-3 w-3 mr-1 -mt-0.5" aria-hidden />
              Request access to see this issuer
            </Link>
          ) : (
            <>
              <Link href={`/promoter-score/${data[hover].ticker}`} className="font-bold text-accent hover:underline">
                {data[hover].ticker}
              </Link>{" "}
              {data[hover].name ? <span style={{ color: "var(--text)" }}>{data[hover].name}</span> : null}
            </>
          )}{" "}
          · {money(data[hover].spendCad || 0)} this quarter across {data[hover].activeContracts}{" "}
          {data[hover].activeContracts === 1 ? "provider" : "providers"}
          {!locked && data[hover].sector ? ` · ${data[hover].sector}` : ""}
        </div>
      ) : locked ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-mute)" }}>
          <Lock className="inline-block h-3 w-3 mr-1 -mt-0.5" style={{ color: "var(--premium)" }} aria-hidden />
          Issuer names are hidden.{" "}
          <Link href={REQUEST_HREF} className="font-semibold hover:underline" style={{ color: "var(--premium)" }}>
            Request access
          </Link>{" "}
          to see them. Source: issuer news releases filed under TSX Venture Policy 3.4 and CSE policy.
        </p>
      ) : (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-mute)" }}>
          Source: issuer news releases filed under TSX Venture Policy 3.4 and CSE policy. Hover a bar for detail.
        </p>
      )}
    </figure>
  );
}
