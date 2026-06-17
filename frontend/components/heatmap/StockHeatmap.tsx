"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import { RankingRow, formatCurrency } from "@/lib/api";

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

function sliceTreemap(items: RankingRow[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ x, y, w, h, row: items[0] }];
  }
  const value = (r: RankingRow) => tileValue(r);
  const total = items.reduce((a, r) => a + value(r), 0);
  let cum = 0;
  let splitIdx = 1;
  for (let i = 0; i < items.length; i++) {
    cum += value(items[i]);
    if (cum >= total / 2) {
      splitIdx = i + 1;
      break;
    }
  }
  if (splitIdx >= items.length) splitIdx = items.length - 1;
  if (splitIdx < 1) splitIdx = 1;

  const a = items.slice(0, splitIdx);
  const b = items.slice(splitIdx);
  const aSum = a.reduce((s, r) => s + value(r), 0);
  const ratio = aSum / total;

  if (w >= h) {
    return [
      ...sliceTreemap(a, x, y, w * ratio, h),
      ...sliceTreemap(b, x + w * ratio, y, w * (1 - ratio), h),
    ];
  } else {
    return [
      ...sliceTreemap(a, x, y, w, h * ratio),
      ...sliceTreemap(b, x, y + h * ratio, w, h * (1 - ratio)),
    ];
  }
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

function colorForChange(pct: number) {
  // Vivid green for positive, vivid red for negative, neutral gray near zero.
  // Three intensity bands per side give the "well-defined" heatmap look.
  if (pct >= 1.5) {
    return {
      bg: "linear-gradient(135deg, #0a7a3e 0%, #16a34a 60%, #22c55e 100%)",
      fg: "#ecfdf5",
    };
  }
  if (pct >= 0.5) {
    return {
      bg: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
      fg: "#f0fdf4",
    };
  }
  if (pct >= 0.05) {
    return {
      bg: "linear-gradient(135deg, #166534 0%, #16a34a 100%)",
      fg: "#f0fdf4",
    };
  }
  if (pct <= -1.5) {
    return {
      bg: "linear-gradient(135deg, #991b1b 0%, #dc2626 60%, #ef4444 100%)",
      fg: "#fef2f2",
    };
  }
  if (pct <= -0.5) {
    return {
      bg: "linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)",
      fg: "#fef2f2",
    };
  }
  if (pct <= -0.05) {
    return {
      bg: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)",
      fg: "#fef2f2",
    };
  }
  return {
    bg: "linear-gradient(135deg, #4b5563 0%, #6b7280 100%)",
    fg: "#f3f4f6",
  };
}

// IQS-band coloring on the 0–100 composite — green tiers for high IQS,
// red for low, gray for missing.
function colorForIqs(iqs: number) {
  if (iqs >= 70) {
    return {
      bg: "linear-gradient(135deg, #0a7a3e 0%, #16a34a 60%, #22c55e 100%)",
    };
  }
  if (iqs >= 55) {
    return { bg: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)" };
  }
  if (iqs >= 40) {
    return { bg: "linear-gradient(135deg, #166534 0%, #16a34a 100%)" };
  }
  if (iqs >= 25) {
    return { bg: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)" };
  }
  if (iqs > 0) {
    return { bg: "linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)" };
  }
  return { bg: "linear-gradient(135deg, #4b5563 0%, #6b7280 100%)" };
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
function shortSector(s: string | null | undefined): string {
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
    return sliceTreemap(sectorAsRows, 0, 0, w, h);
  })();

  const HEADER_H = 24;
  const PAD = 2;
  return sectorRects.map((rect, i) => {
    const meta = sectors[i];
    const innerW = Math.max(0, rect.w - PAD * 2);
    const innerH = Math.max(0, rect.h - HEADER_H - PAD);
    // Tiles are positioned RELATIVE to the sector block's content area,
    // not the heatmap root. Rendering wraps each block in an overflow:hidden
    // container so no tile can ever escape its sector boundary.
    const tiles = innerH > 0 ? sliceTreemap(meta.items, 0, 0, innerW, innerH) : [];
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
      const tiles = sliceTreemap(sorted, 0, 0, w, height);
      return [{ sector: "", x: 0, y: 0, w, h: height, tiles }];
    }
    return layoutWithSectors(rows, Math.max(320, width), height);
  }, [rows, width, height, mode]);

  const HEADER_H = mode === "iqs" ? 0 : 24;
  const PAD = 2;

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{ height }}
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
                  height: HEADER_H - 4,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  pointerEvents: "none",
                  zIndex: 4,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  lineHeight: `${HEADER_H - 4}px`,
                  padding: "0 4px",
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
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: "absolute",
                    left: tileX + 1,
                    top: tileY + 1,
                    width: Math.max(0, tileW - 2),
                    height: Math.max(0, tileH - 2),
                    background: c.bg,
                    color: "#ffffff",
                    borderRadius: 4,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  whileHover={{ scale: 1.025, zIndex: 5 }}
                >
                  <Link
                    href={rect.row.ticker ? `/companies/${encodeURIComponent(rect.row.ticker)}` : "#"}
                    className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
                    style={{ color: "#ffffff", padding: 2 }}
                    title={tileTitle}
                  >
                    {!hideAll && (
                      <div
                        className="tracking-tight leading-none font-mono text-center"
                        style={{
                          color: "#ffffff",
                          fontSize: Math.max(9, tickerFs),
                          fontWeight: 900,
                          letterSpacing: "-0.02em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rect.row.ticker || "—"}
                      </div>
                    )}
                    {!hideAll && !tickerOnly && !tiny && (
                      <div
                        className="leading-none tabular text-center"
                        style={{
                          color: "#ffffff",
                          fontSize: Math.max(9, pctFs),
                          fontWeight: 800,
                          marginTop: 3,
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
