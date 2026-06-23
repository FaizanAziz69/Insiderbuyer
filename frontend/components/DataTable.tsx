"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

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
  /** Show a filter control for this column above the table. */
  filterable?: boolean;
  /** Filter UI: "select" = dropdown of distinct values (default, for text);
   *  "range" = Min/Max number inputs (for numeric columns). */
  filterType?: "select" | "range";
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
 * Generic sortable table with an above-table filter bar.
 *  - `filterable` text columns get a dropdown of distinct values.
 *  - `filterable` + `filterType:"range"` numeric columns get Min/Max inputs.
 *  - Every column header is clickable to sort (asc → desc → off).
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

  const filterCols = columns.filter((c) => c.filterable);

  const optionsByCol = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of filterCols) {
      if (c.filterType === "range") continue;
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
      {filterCols.length > 0 && (
        <div
          className="flex flex-wrap items-end gap-3 p-3 mb-3 rounded-lg"
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
          {Object.values(filters).some((v) => isActive(v)) && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border-strong)", color: "var(--text-soft)" }}
            >
              Clear filters
            </button>
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
              sorted.map((row, i) => (
                <tr key={rowKey(row, i)} className={rowClassName}>
                  {columns.map((c) => (
                    <td key={c.key} className={`${alignClass[c.align ?? "left"]} ${c.className ?? ""}`}>
                      {c.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
