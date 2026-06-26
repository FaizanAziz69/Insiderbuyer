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
  /** Plain-text label for the filter control's title (falls back to `label`). */
  filterLabelText?: string;
  /** Column alignment — applied to BOTH the header and every cell. */
  align?: Align;
  /** Set false to disable click-to-sort on this column. */
  sortable?: boolean;
  /** Expose this column in the collapsible Filters panel. */
  filterable?: boolean;
  /** Filter UI: "select" = dropdown of distinct values; "range" = Min/Max;
   *  "marketCapPreset" = preset cap-band dropdown. */
  filterType?: "select" | "range" | "marketCapPreset";
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

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
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
  initialSort,
  empty = "No data.",
  rowClassName = "",
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null,
  );
  const [filters, setFilters] = useState<Record<string, FilterVal>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);

  const filterCols = columns.filter((c) => c.filterable);
  const activeCount = Object.values(filters).filter(isActive).length;

  const optionsByCol = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of filterCols) {
      if (c.filterType === "range" || c.filterType === "marketCapPreset") continue;
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

  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => isActive(v));
    if (active.length === 0) return rows;
    return rows.filter((row, i) =>
      active.every(([key, v]) => {
        const col = columns.find((c) => c.key === key);
        if (!col) return true;
        if (col.filterType === "marketCapPreset" && typeof v === "string") {
          const preset = CAP_BY_KEY.get(v);
          if (!preset) return true;
          const raw = cellValue(col, row, i);
          const n = typeof raw === "number" ? raw : Number(raw);
          if (raw == null || Number.isNaN(n)) return false;
          return n >= preset.min && n < preset.max;
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [filters, sort, rows.length]);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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

  return (
    <div>
      {/* Filters bar: a button (with active count) that reveals the panel */}
      {filterCols.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md transition"
              style={{
                background: showFilters || activeCount ? "var(--accent)" : "var(--bg-2)",
                color: showFilters || activeCount ? "#fff" : "var(--text-soft)",
                border: `1px solid ${showFilters || activeCount ? "var(--accent)" : "var(--border-strong)"}`,
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters{activeCount ? ` (${activeCount})` : ""}
            </button>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters({})}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-mute hover:text-[var(--bad)] transition"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div
              className="flex flex-wrap items-end gap-3 p-3 mt-2 rounded-lg"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              {filterCols.map((c) => {
                const title = c.filterLabelText ?? (typeof c.label === "string" ? c.label : c.key);
                if (c.filterType === "range") {
                  const fv = (filters[c.key] as { min?: string; max?: string }) || {};
                  return (
                    <div key={c.key} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-mute">
                        {title}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={fv.min ?? ""}
                          onChange={(e) =>
                            setFilters((f) => ({ ...f, [c.key]: { ...fv, min: e.target.value } }))
                          }
                          placeholder="Min"
                          className="text-[13px] rounded-md px-2 py-1.5 w-24"
                          style={numInput}
                        />
                        <span className="text-mute text-[12px]">–</span>
                        <input
                          type="number"
                          value={fv.max ?? ""}
                          onChange={(e) =>
                            setFilters((f) => ({ ...f, [c.key]: { ...fv, max: e.target.value } }))
                          }
                          placeholder="Max"
                          className="text-[13px] rounded-md px-2 py-1.5 w-24"
                          style={numInput}
                        />
                      </div>
                    </div>
                  );
                }
                if (c.filterType === "marketCapPreset") {
                  return (
                    <label key={c.key} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-mute">
                        {title}
                      </span>
                      <select
                        value={(filters[c.key] as string) ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                        className="text-[13px] font-semibold rounded-md px-2.5 py-1.5 min-w-[170px]"
                        style={numInput}
                      >
                        <option value="">All Market Caps</option>
                        {CAP_PRESETS.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                return (
                  <label key={c.key} className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-mute">
                      {title}
                    </span>
                    <select
                      value={(filters[c.key] as string) ?? ""}
                      onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                      className="text-[13px] font-semibold rounded-md px-2.5 py-1.5 min-w-[140px]"
                      style={numInput}
                    >
                      <option value="">All {title}</option>
                      {optionsByCol[c.key]?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              {columns.map((c) => {
                const a = c.align ?? "left";
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={`${alignClass[a]} ${c.className ?? ""}`}>
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
                    <td key={c.key} className={`${alignClass[c.align ?? "left"]} ${c.className ?? ""}`}>
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
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <span className="text-[12px] text-mute tabular">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage <= 0}
              className="inline-flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="inline-flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
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
