"use client";
import { Column } from "@/components/DataTable";

/**
 * Shared left "#" rank column — guarantees identical numbering styling on
 * every table (dark/near-black via --text, larger, bold). The number follows
 * the table's current sort order (1 = first row shown).
 */
export function rankColumn<T>(): Column<T> {
  return {
    key: "rank",
    label: "#",
    sortable: false,
    className: "w-12",
    render: (_r, i) => (
      <span className="tabular text-[15px] font-bold" style={{ color: "var(--text)" }}>
        {i + 1}
      </span>
    ),
  };
}
