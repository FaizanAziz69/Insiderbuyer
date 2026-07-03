"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import { RankingRow, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

interface Props {
  rows: RankingRow[];
  height?: number;
  mode?: "sector" | "iqs";
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: RankingRow;
}

// Compressed value — sqrt narrows the dynamic range so a single mega-cap
// doesn't crush every smaller tile into illegible slivers.
function tileValue(r: RankingRow): number {
  const raw = Math.max(1, r.marketCap || r.totalPurchaseValue || 1);
  return Math.sqrt(raw);
}

/**
 * Squarified treemap (Bruls/Huizing/van Wijk) — the algorithm TradingView's
 * heatmap uses. Produces near-square tiles instead of the stripey rectangles
 * a slice-and-dice layout gives, so the result reads exactly like TradingView.
 * `items` should be pre-sorted descending by value for best aspect ratios.
 */
function squarifyTreemap(items: RankingRow[], X: number, Y: number, W: number, H: number): Rect[] {
  if (items.length === 0 || W <= 0 || H <= 0) return [];
  if (items.length === 1) return [{ x: X, y: Y, w: W, h: H, row: items[0] }];

  const totalVal = items.reduce((s, r) => s + tileValue(r), 0) || 1;
  const totalArea = W * H;
  const scaled = items.map((r) => ({ row: r, area: (tileValue(r) / totalVal) * totalArea }));

  const result: Rect[] = [];
  let x = X, y = Y, w = W, h = H;

  const worst = (rowAreas: number[], side: number): number => {
    let max = -Infinity, min = Infinity, sum = 0;
    for (const a of rowAreas) {
      sum += a;
      if (a > max) max = a;
      if (a < min) min = a;
    }
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const placeRow = (rowItems: { row: RankingRow; area: number }[]) => {
    const sum = rowItems.reduce((s, it) => s + it.area, 0);
    if (w >= h) {
      const colW = sum / h;
      let yy = y;
      for (const it of rowItems) {
        const tileH = it.area / colW;
        result.push({ x, y: yy, w: colW, h: tileH, row: it.row });
        yy += tileH;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w;
      let xx = x;
      for (const it of rowItems) {
        const tileW = it.area / rowH;
        result.push({ x: xx, y, w: tileW, h: rowH, row: it.row });
        xx += tileW;
      }
      y += rowH;
      h -= rowH;
    }
  };

  let row: { row: RankingRow; area: number }[] = [];
  for (const it of scaled) {
    const side = Math.min(w, h);
    if (row.length === 0) {
      row.push(it);
      continue;
    }
    const curWorst = worst(row.map((r) => r.area), side);
    const nextWorst = worst([...row.map((r) => r.area), it.area], side);
    if (nextWorst <= curWorst) {
      row.push(it);
    } else {
      placeRow(row);
      row = [it];
    }
  }
  if (row.length) placeRow(row);
  return result;
}

// Deterministic hash from string → 0..1
function hashUnit(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

/**
 * Daily change % for a tile. Uses the REAL intraday change merged from the
 * live quote feed (rankings?live=1). Only when no quote exists for a ticker
 * do we fall back to an IQS-derived estimate so the tile still renders.
 */
function changePctFor(row: RankingRow): number {
  if (typeof row.changePct === "number") return row.changePct;
  const noise = (hashUnit(row.companyId || row.ticker || row.name) - 0.5) * 1.2;
  // IQS bands on the 0–100 composite scale.
  if (row.iqs >= 70) return 2.0 + noise;
  if (row.iqs >= 55) return 1.0 + noise * 0.8;
  if (row.iqs >= 40) return 0.3 + noise * 0.6;
  if (row.iqs >= 25) return -0.4 + noise * 0.5;
  return -1.8 + noise;
}

// TradingView-style diverging scale: a dark neutral center saturating to a
// solid green for gains and solid red for losses. Bigger moves → more
// saturated, exactly like the TradingView heatmap. Flat fills, no gradients.
const NEUTRAL: [number, number, number] = [40, 44, 54]; // #282C36 dark neutral
const GREEN: [number, number, number] = [22, 168, 95]; // #16A85F strong gain
const RED: [number, number, number] = [221, 60, 58]; // #DD3C3A strong loss

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function colorForChange(pct: number) {
  // Clamp to ±3% — the band over which TradingView saturates the color.
  const t = Math.max(-1, Math.min(1, pct / 3));
  const bg = t >= 0 ? mix(NEUTRAL, GREEN, t) : mix(NEUTRAL, RED, -t);
  return { bg };
}

// IQS-band coloring on the 0–100 composite, mapped onto the same diverging
// scale (50 = neutral, 100 = strong green, 0 = strong red).
function colorForIqs(iqs: number) {
  const t = Math.max(-1, Math.min(1, (iqs - 50) / 50));
  const bg = t >= 0 ? mix(NEUTRAL, GREEN, t) : mix(NEUTRAL, RED, -t);
  return { bg };
}

interface SectorBlock {
  sector: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tiles: Rect[];
}

// Map raw SEC SIC sector strings (e.g. "SERVICES-COMPUTER PROGRA...",
// "CRUDE PETROLEUM & NATURAL GAS") into the ~11 broad categories used by
// finance-publication heatmaps. Keyword-based so unknown SIC variants still
// roll up cleanly.
export function shortSector(s: string | null | undefined): string {
  if (!s) return "Other";
  const u = s.toUpperCase();

  if (
    u.includes("COMPUTER") ||
    u.includes("SOFTWARE") ||
    u.includes("SEMICONDUCTOR") ||
    u.includes("PREPACKAGED") ||
    u.includes("DATA PROCESS") ||
    u.includes("INFORMATION TECH") ||
    u === "TECHNOLOGY"
  )
    return "Technology";

  if (
    u.includes("OIL") ||
    u.includes("GAS ") ||
    u.endsWith(" GAS") ||
    u.includes("PETROLEUM") ||
    u.includes("CRUDE") ||
    u.includes("COAL") ||
    u.includes("DRILLING") ||
    u.includes("REFINING") ||
    u.includes("PIPELINE") ||
    u === "ENERGY"
  )
    return "Energy";

  if (
    u.includes("PHARMA") ||
    u.includes("BIOLOGICAL") ||
    u.includes("MEDICAL") ||
    u.includes("HEALTH") ||
    u.includes("HOSPITAL") ||
    u.includes("DRUG") ||
    u.includes("BIOTECH") ||
    u.includes("SURGICAL")
  )
    return "Health";

  if (
    u.includes("BANK") ||
    u.includes("INSURANCE") ||
    u.includes("FINANC") ||
    u.includes("SECURITIES") ||
    u.includes("INVESTMENT") ||
    u.includes("CREDIT") ||
    u.includes("HOLDING COMPAN")
  )
    return "Financial";

  if (
    u.includes("REAL ESTATE") ||
    u.includes("REIT") ||
    u.includes("LESSOR") ||
    u.includes("PROPERTY") ||
    u.includes("OPERATORS OF")
  )
    return "Real Estate";

  if (
    u.includes("COMMUNICAT") ||
    u.includes("TELECOM") ||
    u.includes("BROADCAST") ||
    u.includes("WIRELESS") ||
    u.includes("CABLE") ||
    u.includes("TELEPHONE")
  )
    return "Communication";

  if (
    u.includes("STEEL") ||
    u.includes("METAL") ||
    u.includes("CHEMICAL") ||
    u.includes("MINING") ||
    u.includes("GOLD") ||
    u.includes("SILVER") ||
    u.includes("PAPER") ||
    u.includes("LUMBER") ||
    u.includes("FOREST") ||
    u.includes("MATERIAL") ||
    u.includes("PLASTIC") ||
    u.includes("CEMENT")
  )
    return "Materials";

  if (
    u.includes("WATER") ||
    u.includes("UTILIT") ||
    u.includes("ELECTRIC SERV") ||
    u.includes("POWER") ||
    u.includes("NATURAL GAS DISTRIBUT")
  )
    return "Utilities";

  if (
    u.includes("FOOD") ||
    u.includes("BEVERAGE") ||
    u.includes("TOBACCO") ||
    u.includes("HOUSEHOLD PROD") ||
    u.includes("AGRICULTURAL") ||
    u.includes("GROCER")
  )
    return "Staples";

  if (
    u.includes("RETAIL") ||
    u.includes("RESTAURANT") ||
    u.includes("AUTO") ||
    u.includes("APPAREL") ||
    u.includes("HOTEL") ||
    u.includes("LEISURE") ||
    u.includes("MOTION PICTURE") ||
    u.includes("ENTERTAIN") ||
    u.includes("TOYS") ||
    u.includes("FURNITURE")
  )
    return "Consumer";

  if (
    u.includes("CONSTRUCT") ||
    u.includes("INDUSTRIAL") ||
    u.includes("MACHINERY") ||
    u.includes("AEROSPACE") ||
    u.includes("DEFENSE") ||
    u.includes("TRANSPORT") ||
    u.includes("RAILROAD") ||
    u.includes("SHIP") ||
    u.includes("ENGINEERING") ||
    u.includes("COMMERCIAL SERV") ||
    u.includes("AIR")
  )
    return "Industrials";

  return "Other";
}

function layoutWithSectors(
  rows: RankingRow[],
  w: number,
  h: number,
): SectorBlock[] {
  const grouped = new Map<string, RankingRow[]>();
  for (const r of rows) {
    const key = shortSector(r.sector);
    const list = grouped.get(key) || [];
    list.push(r);
    grouped.set(key, list);
  }
  const sectors = Array.from(grouped.entries())
    .map(([sector, items]) => {
      items.sort((a, b) => tileValue(b) - tileValue(a));
      const total = items.reduce((s, r) => s + tileValue(r), 0);
      return { sector, items, total };
    })
    .sort((a, b) => b.total - a.total);

  // First-level slice: allocate space per sector by total (compressed) value.
  const sectorRects = (() => {
    const sectorAsRows: RankingRow[] = sectors.map((s) => ({
      rank: 0,
      companyId: s.sector,
      ticker: s.sector,
      name: s.sector,
      sector: s.sector,
      // Square the total so first-level slice sees raw value (sliceTreemap
      // will sqrt it back via tileValue).
      marketCap: s.total * s.total,
      lastPrice: null,
      iqs: 0,
      insiderWeight: 0,
      transactionWeight: 0,
      convictionWeight: 0,
      historicalSuccessWeight: 0,
      clusterWeight: 0,
      marketTimingWeight: 0,
      distinctBuyers: 0,
      transactionCount: 0,
      totalPurchaseValue: s.total * s.total,
    }));
    return squarifyTreemap(sectorAsRows, 0, 0, w, h);
  })();

  const HEADER_H = 28;
  const PAD = 1;
  return sectorRects.map((rect, i) => {
    const meta = sectors[i];
    const innerW = Math.max(0, rect.w - PAD * 2);
    const innerH = Math.max(0, rect.h - HEADER_H - PAD);
    // Tiles are positioned RELATIVE to the sector block's content area,
    // not the heatmap root. Rendering wraps each block in an overflow:hidden
    // container so no tile can ever escape its sector boundary.
    const tiles = innerH > 0 ? squarifyTreemap(meta.items, 0, 0, innerW, innerH) : [];
    return {
      sector: meta.sector,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      tiles,
    };
  });
}

export function StockHeatmap({ rows, height = 520, mode = "sector" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const blocks = useMemo(() => {
    if (!rows.length) return [];
    if (mode === "iqs") {
      // Single flat treemap — no sector grouping. Tiles sized by market cap,
      // colored by IQS band so the user reads it as "where is conviction".
      const sorted = [...rows].sort((a, b) => tileValue(b) - tileValue(a));
      const w = Math.max(320, width);
      const tiles = squarifyTreemap(sorted, 0, 0, w, height);
      return [{ sector: "", x: 0, y: 0, w, h: height, tiles }];
    }
    return layoutWithSectors(rows, Math.max(320, width), height);
  }, [rows, width, height, mode]);

  const HEADER_H = mode === "iqs" ? 0 : 28;
  const PAD = 1;

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{ height, background: "#ffffff", borderRadius: 4 }}
    >
      {blocks.map((b, bi) => {
        const showLabel = b.w >= 80 && b.h >= 60;
        return (
          <div
            key={`block-${b.sector}-${bi}`}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              overflow: "hidden",
            }}
          >
            {showLabel && (
              <div
                style={{
                  position: "absolute",
                  left: PAD,
                  top: 2,
                  right: PAD,
                  height: HEADER_H - 2,
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#000000",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  pointerEvents: "none",
                  zIndex: 4,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  lineHeight: `${HEADER_H - 2}px`,
                  padding: "0 5px",
                }}
              >
                {b.sector}
              </div>
            )}
            {b.tiles.map((rect, i) => {
              const pct = changePctFor(rect.row);
              const iqs = rect.row.iqs;
              const c = mode === "iqs" ? colorForIqs(iqs) : colorForChange(pct);
              const tileW = rect.w;
              const tileH = rect.h;
              const area = tileW * tileH;
              const hideAll = tileW < 32 || tileH < 26;
              const tickerOnly = !hideAll && (tileW < 58 || tileH < 44);
              const tiny = area < 4500;
              const small = area < 10000;
              const medium = area < 18000;
              const tickerLen = Math.max(2, (rect.row.ticker || "").length);
              const tickerFs = Math.min(
                tickerOnly ? 12 : tiny ? 15 : small ? 19 : medium ? 26 : 36,
                Math.floor(((tileW - 8) / tickerLen) * 1.6),
              );
              const pctFs = Math.min(
                small ? 11 : medium ? 13 : 16,
                Math.floor(((tileW - 8) / 5) * 1.4),
              );
              // Logos on comfortably-sized tiles; company name on the larger ones.
              const showLogo = !hideAll && !tickerOnly && tileW >= 66 && tileH >= 60;
              const showName = !hideAll && !tickerOnly && !tiny && !small && tileW >= 110;
              const logoSize = Math.max(16, Math.min(34, Math.floor(tileH * 0.32)));
              const sign = pct >= 0 ? "+" : "";
              const subLabel =
                mode === "iqs"
                  ? `IQS ${iqs.toFixed(1)}`
                  : `${sign}${pct.toFixed(2)}%`;
              const tileTitle =
                mode === "iqs"
                  ? `${rect.row.ticker || rect.row.name} · IQS ${iqs.toFixed(1)} · ${formatCurrency(rect.row.marketCap)}`
                  : `${rect.row.ticker || rect.row.name} · ${sign}${pct.toFixed(2)}% · ${formatCurrency(rect.row.marketCap)}`;
              const tileX = PAD + rect.x;
              const tileY = HEADER_H + rect.y;
              return (
                <motion.div
                  key={rect.row.companyId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 40) * 0.006 }}
                  style={{
                    position: "absolute",
                    left: tileX + 1,
                    top: tileY + 1,
                    width: Math.max(0, tileW - 2),
                    height: Math.max(0, tileH - 2),
                    background: c.bg,
                    color: "#ffffff",
                    borderRadius: 2,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  whileHover={{
                    zIndex: 5,
                    filter: "brightness(1.18)",
                    boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.95)",
                  }}
                >
                  <Link
                    href={rect.row.ticker ? `/companies/${encodeURIComponent(rect.row.ticker)}` : "#"}
                    className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
                    style={{ color: "#ffffff", padding: 2, gap: 2 }}
                    title={tileTitle}
                  >
                    {showLogo && (
                      <span
                        className="rounded-md overflow-hidden bg-white/90 flex items-center justify-center flex-shrink-0"
                        style={{ width: logoSize, height: logoSize, padding: 1 }}
                      >
                        <CompanyLogo
                          ticker={rect.row.ticker || ""}
                          name={rect.row.name}
                          size={logoSize - 2}
                        />
                      </span>
                    )}
                    {!hideAll && (
                      <div
                        className="tracking-tight leading-none text-center"
                        style={{
                          color: "#ffffff",
                          fontSize: Math.max(9, tickerFs),
                          fontWeight: 800,
                          letterSpacing: "-0.01em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rect.row.ticker || "—"}
                      </div>
                    )}
                    {showName && (
                      <div
                        className="leading-tight text-center px-1"
                        style={{
                          color: "rgba(255,255,255,0.92)",
                          fontSize: Math.max(9, Math.min(13, Math.floor(tileW / 12))),
                          fontWeight: 600,
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rect.row.name}
                      </div>
                    )}
                    {!hideAll && !tickerOnly && !tiny && (
                      <div
                        className="leading-none tabular text-center"
                        style={{
                          color: "#ffffff",
                          fontSize: Math.max(9, pctFs),
                          fontWeight: 800,
                          marginTop: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {subLabel}
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
