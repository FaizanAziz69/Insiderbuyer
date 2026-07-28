"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  SlidersHorizontal,
  X,
} from "lucide-react";

const PAGE_SIZE = 25;

export type Align = "left" | "right" | "center";

export interface Column<T> {
  /** Stable key (used for sort/filter state + React keys). */
  key: string;
  /** Header label. */
  label: React.ReactNode;
  /** Optional column-group label. Contiguous columns sharing a group render
   *  under one segmented header band (e.g. "Stock" | "Insider Score"). */
  group?: string;
  /** Plain-text label for the filter control's title (falls back to `label`). */
  filterLabelText?: string;
  /** Column alignment — applied to BOTH the header and every cell. */
  align?: Align;
  /** Set false to disable click-to-sort on this column. */
  sortable?: boolean;
  /** Expose this column in the collapsible Filters panel. */
  filterable?: boolean;
  /** Filter UI: "select" = dropdown of distinct values; "range" = Min/Max;
   *  "marketCapPreset" = preset cap-band dropdown; "preset" = a custom
   *  dropdown of predicate-based presets supplied via `filterPresets`. */
  filterType?: "select" | "range" | "marketCapPreset" | "preset";
  /** Override the auto-detected preset bands for a "range" column. */
  filterBands?: Band[];
  /** Predicate-based preset options for filterType "preset" (e.g. insider
   *  type: Cluster / CEO / CFO / Hedge Funds). */
  filterPresets?: { key: string; label: string; test: (row: T) => boolean }[];
  /** Display string for a row's value in a select dropdown. */
  filterLabel?: (row: T) => string;
  /** Value used for sorting AND filtering. */
  sortValue?: (row: T) => number | string | null | undefined;
  /** Cell renderer. */
  render: (row: T, index: number) => React.ReactNode;
  /** Optional fixed width utility class (e.g. "w-12"). */
  className?: string;
}

type FilterVal = string | { min?: string; max?: string };

/** Preset market-cap bands (same buckets stockanalysis.com / MarketBeat use). */
export const CAP_PRESETS: { key: string; label: string; min: number; max: number }[] = [
  { key: "mega", label: "Mega ( > $200B )", min: 200e9, max: Infinity },
  { key: "large", label: "Large ( $10B – $200B )", min: 10e9, max: 200e9 },
  { key: "mid", label: "Mid ( $2B – $10B )", min: 2e9, max: 10e9 },
  { key: "small", label: "Small ( $300M – $2B )", min: 300e6, max: 2e9 },
  { key: "micro", label: "Micro ( $50M – $300M )", min: 50e6, max: 300e6 },
  { key: "nano", label: "Nano ( < $50M )", min: 0, max: 50e6 },
];
const CAP_BY_KEY = new Map(CAP_PRESETS.map((p) => [p.key, p]));

/** A preset numeric band. `max` is exclusive. */
export type Band = { key: string; label: string; min: number; max: number };

/** Preset bands per metric family — the round numbers screeners conventionally
 *  use, so a filter is one tap instead of typing two numbers. */
const PRICE_BANDS: Band[] = [
  { key: "p-1", label: "Under $1", min: -Infinity, max: 1 },
  { key: "p-5", label: "$1 – $5", min: 1, max: 5 },
  { key: "p-10", label: "$5 – $10", min: 5, max: 10 },
  { key: "p-25", label: "$10 – $25", min: 10, max: 25 },
  { key: "p-50", label: "$25 – $50", min: 25, max: 50 },
  { key: "p-100", label: "$50 – $100", min: 50, max: 100 },
  { key: "p-250", label: "$100 – $250", min: 100, max: 250 },
  { key: "p-inf", label: "Over $250", min: 250, max: Infinity },
];
const PCT_BANDS: Band[] = [
  { key: "up20", label: "Up 20% or more", min: 20, max: Infinity },
  { key: "up10", label: "Up 10% – 20%", min: 10, max: 20 },
  { key: "up5", label: "Up 5% – 10%", min: 5, max: 10 },
  { key: "up0", label: "Up 0% – 5%", min: 0, max: 5 },
  { key: "dn5", label: "Down 0% – 5%", min: -5, max: 0 },
  { key: "dn10", label: "Down 5% – 10%", min: -10, max: -5 },
  { key: "dn20", label: "Down 10% – 20%", min: -20, max: -10 },
  { key: "dn99", label: "Down 20% or more", min: -Infinity, max: -20 },
];
const VOLUME_BANDS: Band[] = [
  { key: "v-100k", label: "Under 100K", min: -Infinity, max: 100e3 },
  { key: "v-500k", label: "100K – 500K", min: 100e3, max: 500e3 },
  { key: "v-1m", label: "500K – 1M", min: 500e3, max: 1e6 },
  { key: "v-5m", label: "1M – 5M", min: 1e6, max: 5e6 },
  { key: "v-20m", label: "5M – 20M", min: 5e6, max: 20e6 },
  { key: "v-inf", label: "Over 20M", min: 20e6, max: Infinity },
];
const MONEY_BANDS: Band[] = [
  { key: "m-10k", label: "Under $10K", min: -Infinity, max: 10e3 },
  { key: "m-100k", label: "$10K – $100K", min: 10e3, max: 100e3 },
  { key: "m-500k", label: "$100K – $500K", min: 100e3, max: 500e3 },
  { key: "m-1m", label: "$500K – $1M", min: 500e3, max: 1e6 },
  { key: "m-10m", label: "$1M – $10M", min: 1e6, max: 10e6 },
  { key: "m-inf", label: "Over $10M", min: 10e6, max: Infinity },
];
const SCORE_BANDS: Band[] = [
  { key: "s-80", label: "80 – 100", min: 80, max: Infinity },
  { key: "s-60", label: "60 – 80", min: 60, max: 80 },
  { key: "s-40", label: "40 – 60", min: 40, max: 60 },
  { key: "s-20", label: "20 – 40", min: 20, max: 40 },
  { key: "s-0", label: "Under 20", min: -Infinity, max: 20 },
];
const COUNT_BANDS: Band[] = [
  { key: "c-1", label: "1", min: 1, max: 2 },
  { key: "c-2", label: "2 – 4", min: 2, max: 5 },
  { key: "c-5", label: "5 – 9", min: 5, max: 10 },
  { key: "c-10", label: "10 or more", min: 10, max: Infinity },
];

/** Pick the band family for a column from its key + label — so existing
 *  `filterType: "range"` columns become preset dropdowns with no call-site
 *  changes. */
function bandsForColumn<T>(c: Column<T>): Band[] {
  if (c.filterBands?.length) return c.filterBands;
  const text = `${c.key} ${c.filterLabelText ?? (typeof c.label === "string" ? c.label : "")}`
    .toLowerCase();
  if (/market\s*cap|mktcap|\bcap\b/.test(text)) return CAP_PRESETS;
  if (/score|iqs|rating/.test(text)) return SCORE_BANDS;
  if (/%|pct|percent|change|return|upside|yield|margin|growth/.test(text)) return PCT_BANDS;
  if (/volume|\bvol\b|shares/.test(text)) return VOLUME_BANDS;
  if (/price|cost|close|target/.test(text)) return PRICE_BANDS;
  if (/value|amount|total|spend|paid|revenue|income/.test(text)) return MONEY_BANDS;
  if (/count|buyers|trades|filings|insiders/.test(text)) return COUNT_BANDS;
  return PRICE_BANDS;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Rows per page (default 25). Set to the row count to show one page with
   *  no pagination controls. */
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Default active filter values, keyed by column key (e.g. { marketCap: "large" }). */
  initialFilters?: Record<string, FilterVal>;
  empty?: React.ReactNode;
  rowClassName?: string;
}

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function cellValue<T>(col: Column<T>, row: T, index: number): string | number | null {
  if (col.sortValue) {
    const v = col.sortValue(row);
    return v == null ? null : v;
  }
  const r = col.render(row, index);
  return typeof r === "string" || typeof r === "number" ? r : null;
}

function filterText<T>(col: Column<T>, row: T, index: number): string {
  if (col.filterLabel) return col.filterLabel(row);
  const v = cellValue(col, row, index);
  return v == null ? "" : String(v);
}

function isActive(v: FilterVal | undefined): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v !== "";
  return (v.min ?? "") !== "" || (v.max ?? "") !== "";
}

/**
 * Generic table — click-to-sort column headers (asc → desc → off), 25-row
 * pagination, and an opt-in "Filters" panel hidden behind a button (the
 * stockanalysis.com / TipRanks pattern: clean table by default, filters on
 * demand with presets).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize,
  initialSort,
  initialFilters,
  empty = "No data.",
  rowClassName = "",
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null,
  );
  const [filters, setFilters] = useState<Record<string, FilterVal>>(
    initialFilters ?? {},
  );
  const [page, setPage] = useState(0);

  // A column's filter is only useful if the rows actually carry data for it —
  // otherwise the control would do nothing, so we hide it entirely.
  const hasNumericData = (c: Column<T>) =>
    rows.some((r, i) => {
      const raw = cellValue(c, r, i);
      const n = typeof raw === "number" ? raw : Number(raw);
      return raw != null && !Number.isNaN(n);
    });
  const filterCols = columns.filter((c) => {
    if (!c.filterable) return false;
    if (c.filterType === "range" || c.filterType === "marketCapPreset") {
      return hasNumericData(c);
    }
    if (c.filterType === "preset") {
      // Only show when at least one preset actually matches some row.
      return !!c.filterPresets?.some((p) => rows.some((r) => p.test(r)));
    }
    // select (default): needs at least one distinct value
    return rows.some((r, i) => !!filterText(c, r, i));
  });
  const activeCount = Object.values(filters).filter(isActive).length;

  const optionsByCol = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of filterCols) {
      if (
        c.filterType === "range" ||
        c.filterType === "marketCapPreset" ||
        c.filterType === "preset"
      )
        continue;
      const set = new Set<string>();
      rows.forEach((r, i) => {
        const t = filterText(c, r, i);
        if (t) set.add(t);
      });
      m[c.key] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  // Bands that actually contain rows, with their counts — empty bands are
  // never offered, so picking one can't produce an empty table.
  const bandsByCol = useMemo(() => {
    const m: Record<string, { band: Band; count: number }[]> = {};
    for (const c of filterCols) {
      if (c.filterType !== "range") continue;
      const nums: number[] = [];
      rows.forEach((r, i) => {
        const raw = cellValue(c, r, i);
        const n = typeof raw === "number" ? raw : Number(raw);
        if (raw != null && !Number.isNaN(n)) nums.push(n);
      });
      m[c.key] = bandsForColumn(c)
        .map((band) => ({ band, count: nums.filter((n) => n >= band.min && n < band.max).length }))
        .filter((b) => b.count > 0);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => isActive(v));
    if (active.length === 0) return rows;
    return rows.filter((row, i) =>
      active.every(([key, v]) => {
        const col = columns.find((c) => c.key === key);
        if (!col) return true;
        if (col.filterType === "preset" && typeof v === "string") {
          const preset = col.filterPresets?.find((p) => p.key === v);
          return preset ? preset.test(row) : true;
        }
        if (col.filterType === "marketCapPreset" && typeof v === "string") {
          const preset = CAP_BY_KEY.get(v);
          if (!preset) return true;
          const raw = cellValue(col, row, i);
          const n = typeof raw === "number" ? raw : Number(raw);
          if (raw == null || Number.isNaN(n)) return false;
          return n >= preset.min && n < preset.max;
        }
        if (col.filterType === "range" && typeof v === "string") {
          const band = bandsForColumn(col).find((b) => b.key === v);
          if (!band) return true;
          const raw = cellValue(col, row, i);
          const n = typeof raw === "number" ? raw : Number(raw);
          if (raw == null || Number.isNaN(n)) return false;
          return n >= band.min && n < band.max;
        }
        if (typeof v === "string") return filterText(col, row, i) === v;
        const raw = cellValue(col, row, i);
        const n = typeof raw === "number" ? raw : Number(raw);
        if (raw == null || Number.isNaN(n)) return false;
        if ((v.min ?? "") !== "" && n < Number(v.min)) return false;
        if ((v.max ?? "") !== "" && n > Number(v.max)) return false;
        return true;
      }),
    );
  }, [rows, filters, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = cellValue(col, a, 0);
      const vb = cellValue(col, b, 0);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sort, columns]);

  const perPage = Math.max(1, pageSize ?? PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
  useEffect(() => {
    setPage(0);
  }, [filters, sort, rows.length]);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * perPage, safePage * perPage + perPage);

  function toggle(key: string, sortable: boolean) {
    if (sortable === false) return;
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  const numInput = {
    background: "var(--bg-1)",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
  } as const;

  // Column keys where a NEW group starts (not counting the first column) —
  // used to draw a vertical divider through the whole table at the boundary.
  const groupStartKeys = new Set<string>();
  if (columns.some((c) => c.group)) {
    for (let i = 1; i < columns.length; i++) {
      if (columns[i].group !== columns[i - 1].group) groupStartKeys.add(columns[i].key);
    }
  }
  const boundaryStyle = (key: string): React.CSSProperties | undefined =>
    groupStartKeys.has(key) ? { borderLeft: "2px solid var(--border-strong)" } : undefined;

  return (
    <div>
      {/* Filters — ONE horizontal bar on every screen size. Preset bands
          only (no min/max typing); scrolls sideways rather than stacking. */}
      {filterCols.length > 0 && (
        <div
          className="mb-3 rounded-lg flex items-center gap-2 px-2.5 py-2 overflow-x-auto"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            scrollbarWidth: "none",
          }}
        >
          <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase font-bold tracking-wider text-mute flex-none pl-0.5 pr-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </span>

          {filterCols.map((c) => {
            const title = c.filterLabelText ?? (typeof c.label === "string" ? c.label : c.key);
            const cur = (filters[c.key] as string) ?? "";
            const on = cur !== "";
            const selStyle: React.CSSProperties = {
              ...numInput,
              borderColor: on ? "var(--accent)" : "var(--border-strong)",
              color: on ? "var(--accent)" : "var(--text)",
              fontWeight: on ? 700 : 600,
            };

            // Preset bands (was Min/Max) ─────────────────────────────
            if (c.filterType === "range") {
              const opts = bandsByCol[c.key] ?? [];
              if (opts.length < 2) return null;
              return (
                <select
                  key={c.key}
                  aria-label={`${title} filter`}
                  value={cur}
                  onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                  className="flex-none text-[12.5px] rounded-md px-2.5 py-1.5"
                  style={selStyle}
                >
                  <option value="">{title}: Any</option>
                  {opts.map(({ band, count }) => (
                    <option key={band.key} value={band.key}>
                      {band.label} ({count})
                    </option>
                  ))}
                </select>
              );
            }

            if (c.filterType === "marketCapPreset") {
              return (
                <select
                  key={c.key}
                  aria-label={`${title} filter`}
                  value={cur}
                  onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                  className="flex-none text-[12.5px] rounded-md px-2.5 py-1.5"
                  style={selStyle}
                >
                  <option value="">All Market Caps</option>
                  {CAP_PRESETS.map((cap) => (
                    <option key={cap.key} value={cap.key}>
                      {cap.label}
                    </option>
                  ))}
                </select>
              );
            }

            if (c.filterType === "preset") {
              return (
                <select
                  key={c.key}
                  aria-label={`${title} filter`}
                  value={cur}
                  onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                  className="flex-none text-[12.5px] rounded-md px-2.5 py-1.5"
                  style={selStyle}
                >
                  <option value="">All {title}</option>
                  {c.filterPresets?.map((pr) => (
                    <option key={pr.key} value={pr.key}>
                      {pr.label}
                    </option>
                  ))}
                </select>
              );
            }

            // Distinct-value select
            return (
              <select
                key={c.key}
                aria-label={`${title} filter`}
                value={cur}
                onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                className="flex-none text-[12.5px] rounded-md px-2.5 py-1.5"
                style={selStyle}
              >
                <option value="">All {title}</option>
                {optionsByCol[c.key]?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          })}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="flex-none inline-flex items-center gap-1 text-[12px] font-bold ml-auto pl-2 pr-1 text-mute hover:text-[var(--bad)] transition"
            >
              <X className="h-3.5 w-3.5" /> Clear ({activeCount})
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            {/* Segmented group band — renders when any column declares a group
                (e.g. "Stock" | "Insider Score"). Contiguous same-group columns
                are merged into one banded header cell. */}
            {columns.some((c) => c.group) && (
              <tr>
                {columns
                  .reduce<{ group: string | undefined; span: number }[]>((acc, c) => {
                    const last = acc[acc.length - 1];
                    if (last && last.group === c.group) last.span += 1;
                    else acc.push({ group: c.group, span: 1 });
                    return acc;
                  }, [])
                  .map((g, i) => (
                    <th
                      key={`grp-${i}`}
                      colSpan={g.span}
                      className="text-center"
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        fontWeight: 800,
                        padding: "6px 8px",
                        color: g.group ? "var(--accent)" : "var(--text-faint)",
                        background: g.group
                          ? "color-mix(in srgb, var(--accent) 6%, var(--bg-3))"
                          : "var(--bg-3)",
                        borderBottom: "1px solid var(--border)",
                        borderLeft: i > 0 ? "2px solid var(--border-strong)" : undefined,
                      }}
                    >
                      {g.group ?? ""}
                    </th>
                  ))}
              </tr>
            )}
            <tr>
              {columns.map((c) => {
                const a = c.align ?? "left";
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={`${alignClass[a]} ${c.className ?? ""}`} style={boundaryStyle(c.key)}>
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={() => toggle(c.key, sortable)}
                      className={`inline-flex items-center gap-1 ${
                        a === "right" ? "flex-row-reverse" : ""
                      } ${sortable ? "cursor-pointer hover:text-accent" : "cursor-default"}`}
                      style={{ font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: active ? "var(--accent)" : "inherit" }}
                    >
                      <span>{c.label}</span>
                      {sortable &&
                        (active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-30" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-mute py-10">
                  {empty}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={rowKey(row, safePage * PAGE_SIZE + i)} className={rowClassName}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`${alignClass[c.align ?? "left"]} ${c.className ?? ""}`}
                      style={boundaryStyle(c.key)}
                    >
                      {c.render(row, safePage * PAGE_SIZE + i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — 25 per page, buttons in the nav-bar color */}
      {sorted.length > perPage && (
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <span className="text-[12px] text-mute tabular">
            {safePage * perPage + 1}–{Math.min((safePage + 1) * perPage, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage <= 0}
              className="btn-hover inline-flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--brand-surface)", color: "#fff" }}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="text-[12px] text-mute tabular px-1">
              Page {safePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="btn-hover inline-flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--brand-surface)", color: "#fff" }}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
