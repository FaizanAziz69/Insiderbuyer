"use client";
import { VISIBLE_SECTOR_GROUPS } from "@/lib/sector-groups";

/**
 * Sector filter for Insider Score tables. The options are the eleven "main
 * sectors" George named (2026-09-01) — the earlier GICS-shaped list read as
 * random on the page. Order here is HIS order, deliberately not the backend's
 * classification precedence.
 *
 * Slugs mirror backend/src/iqs/sector-groups.ts — the API matches them by
 * keyword over sector + industry (`?sectorGroup=`), because the raw sector
 * column mixes GICS names with one-company SIC descriptions. Real Estate,
 * Utilities and Communication stay in that table (so REITs aren't filed as
 * Financials) but are `hidden` there and absent here on purpose.
 */
/** George's display order — deliberately NOT the backend's precedence order. */
const DISPLAY_ORDER = [
  "technology",
  "biotech",
  "healthcare",
  "metals-mining",
  "materials",
  "manufacturing",
  "energy",
  "consumer-discretionary",
  "consumer-staples",
  "financials",
] as const;

/** Labels come from the shared table so the two lists cannot drift apart. */
export const SECTOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  ...DISPLAY_ORDER.map((slug) => {
    const g = VISIBLE_SECTOR_GROUPS.find((x) => x.slug === slug);
    return { value: slug, label: g ? g.label : slug };
  }),
];

export type SectorValue = string;

export function SectorFilter({
  value,
  onChange,
}: {
  value: SectorValue;
  onChange: (v: SectorValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="text-[12px] font-bold uppercase tracking-wider"
        style={{ color: "var(--text-mute)" }}
      >
        Sector
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SectorValue)}
        className="px-3 py-1.5 rounded-lg text-[13px] font-semibold"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        {SECTOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
