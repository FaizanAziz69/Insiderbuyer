"use client";
import { Users } from "lucide-react";
import { formatCurrency } from "@/lib/api";

interface Tx {
  type?: "BUY" | "SELL";
  transactionCode?: string;
  totalValue: number;
  priceSuspect?: boolean;
}

/**
 * "What Are Insiders Doing?" — a single buy-vs-sell balance meter, styled
 * like the analyst-target gauge below it: a red→green track with a marker at
 * the buy share of open-market dollar flow, the total bought on the green end
 * and total sold on the red end. Replaces the old four-paragraph summary.
 */
export function InsiderBuySellMeter({ transactions }: { transactions?: Tx[] }) {
  const txs = transactions || [];
  let buy = 0;
  let sell = 0;
  for (const t of txs) {
    if (t.priceSuspect) continue; // filer-error dollar figure — never counted
    const v = Number(t.totalValue) || 0;
    if (v <= 0) continue;
    const isBuy = t.type === "BUY" || t.transactionCode === "P";
    const isSell = t.type === "SELL" || t.transactionCode === "S";
    if (isBuy) buy += v;
    else if (isSell) sell += v;
  }
  const total = buy + sell;
  if (total <= 0) return null; // no open-market flow → nothing to meter

  const buyFrac = buy / total; // 0 = all selling, 1 = all buying
  const pos = Math.round(buyFrac * 100);
  const word =
    buyFrac >= 0.6 ? "Net Buying" : buyFrac <= 0.4 ? "Net Selling" : "Balanced";
  const wordColor =
    buyFrac >= 0.6 ? "var(--good)" : buyFrac <= 0.4 ? "var(--bad)" : "var(--text-mute)";

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Users className="h-4 w-4" />
        </span>
        <h2 className="text-[20px] sm:text-[22px] font-bold tracking-tight">
          What Are Insiders Doing?
        </h2>
      </div>

      <div className="flex items-baseline justify-between mb-5">
        <span className="text-[11px] uppercase tracking-wider font-bold text-mute">
          Open-market buy / sell balance
        </span>
        <span className="text-[16px] font-bold" style={{ color: wordColor }}>
          {word}
        </span>
      </div>

      {/* Track: red (selling) → green (buying), marker at the buy share. */}
      <div className="relative h-2.5 rounded-full" style={{ background: "linear-gradient(90deg, var(--bad), var(--bg-3), var(--good))" }}>
        <div
          className="absolute flex flex-col items-center"
          style={{ left: `${pos}%`, transform: "translateX(-50%)", top: -6 }}
        >
          <div
            className="h-5 w-5 rounded-full border-2"
            style={{ background: wordColor, borderColor: "var(--bg-2)" }}
          />
        </div>
      </div>

      {/* Totals on each end. */}
      <div className="flex items-start justify-between mt-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--bad)" }}>
            Sold
          </div>
          <div className="text-[20px] font-bold tabular" style={{ color: "var(--bad)" }}>
            {formatCurrency(sell)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--good)" }}>
            Bought
          </div>
          <div className="text-[20px] font-bold tabular" style={{ color: "var(--good)" }}>
            {formatCurrency(buy)}
          </div>
        </div>
      </div>

      <p className="text-[11.5px] text-faint mt-4 leading-relaxed">
        Open-market Form 4 purchases (code P) vs sales (code S) on file for this
        company. Grants, option exercises and tax withholdings are excluded.
        Informational only.
      </p>
    </section>
  );
}
