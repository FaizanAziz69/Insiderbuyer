"use client";
import { Column } from "@/components/DataTable";

/**
 * Shared left "#" rank column — guarantees identical numbering styling on
 * every table (dark/near-black via --text, larger, bold). The number follows
 * the table's current sort order (1 = first row shown).
 */
export function rankColumn<T>(opts?: { countdownFrom?: number }): Column<T> {
  return {
    key: "rank",
    label: "#",
    sortable: false,
    className: "w-12",
    // `total` is the post-filter row count handed over by DataTable; countdown
    // tables have to use it or the ranks keep counting from the unfiltered
    // total and never renumber when a filter is applied. `countdownFrom` stays
    // as the fallback for tables rendered outside DataTable.
    render: (_r, i, total) => (
      <span className="tabular text-[15px] font-bold" style={{ color: "var(--text)" }}>
        {opts?.countdownFrom ? `#${(total ?? opts.countdownFrom) - i}` : i + 1}
      </span>
    ),
  };
}
