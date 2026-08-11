/**
 * Single source of truth for a company's insider buy/sell dollar flow, so the
 * "What Are Insiders Doing?" meter and the "Recent Insider Activity" summary
 * (and anything else) always agree — previously they filtered differently and
 * the totals didn't reconcile.
 *
 * Rules (open-market only):
 *  - a trade counts as a BUY if type==="BUY" or code "P", a SELL if type==="SELL"
 *    or code "S"; every other Form 4 code (grants A, option exercises M, tax
 *    withholding F, …) is ignored — it is not open-market flow;
 *  - a `priceSuspect` filer-error dollar figure contributes to the trade COUNT
 *    but never to the dollar totals (its value is unreliable).
 */
export interface FlowTx {
  type?: "BUY" | "SELL";
  transactionCode?: string;
  totalValue: number;
  priceSuspect?: boolean;
  insiderName?: string;
}

export interface InsiderFlow {
  buyValue: number;
  sellValue: number;
  buyCount: number;
  sellCount: number;
  distinctBuyers: number;
}

export function computeInsiderFlow(transactions?: FlowTx[]): InsiderFlow {
  const txs = transactions || [];
  let buyValue = 0;
  let sellValue = 0;
  let buyCount = 0;
  let sellCount = 0;
  const buyers = new Set<string>();
  for (const t of txs) {
    const isBuy = t.type === "BUY" || t.transactionCode === "P";
    const isSell = t.type === "SELL" || t.transactionCode === "S";
    if (!isBuy && !isSell) continue; // grants / options / withholding — not flow
    const v = t.priceSuspect ? 0 : Number(t.totalValue) || 0;
    if (isBuy) {
      buyCount += 1;
      if (t.insiderName) buyers.add(t.insiderName);
      if (v > 0) buyValue += v;
    } else {
      sellCount += 1;
      if (v > 0) sellValue += v;
    }
  }
  return { buyValue, sellValue, buyCount, sellCount, distinctBuyers: buyers.size };
}
