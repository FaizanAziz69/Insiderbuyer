"use client";

/**
 * Brief v8 §4.1 — described in the brief as "the most important spec in this
 * brief", and the reason it is a component rather than a string somewhere.
 *
 * Every surface that shows a performance figure shows one of these next to it.
 * A backtest says HYPOTHETICAL, a paper record says SIMULATED, and only real
 * executed money says LIVE. The wording is fixed by the brief and is not
 * shortened to fit a layout — "HYPOTHETICAL" is the whole point of the badge.
 */
export type RecordType = "backtest" | "paper" | "live";

const STYLE: Record<RecordType, { bg: string; fg: string; label: string; title: string }> = {
  backtest: {
    bg: "var(--bad)",
    fg: "#ffffff",
    label: "HYPOTHETICAL — BACKTEST",
    title:
      "Simulated. These figures come from applying the published rules to historical data; no money was traded and past simulated performance does not predict future results.",
  },
  paper: {
    bg: "var(--gold)",
    fg: "#3b2300",
    label: "PAPER — SIMULATED LIVE",
    title:
      "Simulated live trading. Orders are recorded ahead of the market and priced at the following close. No capital is at risk.",
  },
  live: {
    bg: "var(--good)",
    fg: "#ffffff",
    label: "LIVE — PROPRIETARY CAPITAL",
    title: "Real executed profit and loss on the firm's own capital.",
  },
};

export function RecordBadge({
  type,
  size = "sm",
}: {
  type: RecordType;
  size?: "sm" | "md";
}) {
  const s = STYLE[type] ?? STYLE.backtest;
  const dims = size === "md" ? "h-6 px-2.5 text-[11px]" : "h-5 px-2 text-[9.5px]";
  return (
    <span
      className={`inline-flex items-center ${dims} rounded-full font-bold uppercase tracking-wider whitespace-nowrap`}
      style={{ background: s.bg, color: s.fg }}
      title={s.title}
    >
      {s.label}
    </span>
  );
}

export const RECORD_LABEL = (t: RecordType) => (STYLE[t] ?? STYLE.backtest).label;
