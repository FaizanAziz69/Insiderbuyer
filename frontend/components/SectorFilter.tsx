"use client";

/**
 * Sector filter for Insider Score tables (George, 2026-09-01). Slugs mirror
 * backend/src/iqs/sector-groups.ts — the API matches them by keyword over
 * sector + industry (`?sectorGroup=`), because the raw sector column mixes
 * GICS names with one-company SIC descriptions.
 */
export const SECTOR_OPTIONS = [
  { value: "all", label: "All sectors" },
  { value: "healthcare", label: "Healthcare" },
  { value: "financials", label: "Financials" },
  { value: "technology", label: "Technology" },
  { value: "energy", label: "Energy" },
  { value: "materials", label: "Basic Materials" },
  { value: "industrials", label: "Industrials" },
  { value: "consumer-cyclical", label: "Consumer Cyclical" },
  { value: "consumer-defensive", label: "Consumer Defensive" },
  { value: "real-estate", label: "Real Estate" },
  { value: "utilities", label: "Utilities" },
  { value: "communication", label: "Communication & Media" },
] as const;

export type SectorValue = (typeof SECTOR_OPTIONS)[number]["value"];

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
