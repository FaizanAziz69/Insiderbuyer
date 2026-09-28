import type { Pick, SelectorContext, StrategyDef } from './strategy-types';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Brief v8 §3, strategies 7 to 12 — the Form 4 datasets.
 *
 * THE DISCLOSURE LAG HERE IS MODELLED, NOT OBSERVED, and that has to be said
 * plainly. `insider_transactions` stores the transaction date, the accession
 * number and the filing URL — but no filing DATE. Section 16 gives an insider
 * two business days to file, and §5.2 of this brief names exactly that: "Form 4
 * two-day lag". So a purchase becomes tradable two days after the transaction.
 *
 * It is the brief's own model and it is close to right for most filings, but it
 * is not the same statement as the congress strategies, which read a real filed
 * date out of the PTR. Late filers are treated as punctual here, which flatters
 * these strategies by however long they were late. Stated on every card.
 */

const FORM4_LAG_DAYS = 2;

const FORM4_LIMITS = [
  'Form 4 carries a two-day filing deadline and our records store the transaction date, not the filing date, so entry is modelled at transaction date plus two days. An insider who filed late is treated here as having filed on time, which flatters the result by the length of the delay.',
  'Open-market purchases only — transaction code P. Grants, option exercises and sales are not signals of the same kind and are excluded rather than netted.',
  'Prices are dividend-unadjusted daily closes for the symbols we hold. A name we never ingested produces no position rather than a zero return.',
];

/** Disclosed open-market BUYS, aggregated per ticker, with the lag applied. */
async function insiderBuys(
  ctx: SelectorContext,
  asOfMs: number,
  windowDays: number,
): Promise<Array<{ ticker: string; value: number; buyers: number; roles: string[] }>> {
  const rows: Array<{ ticker: string; value: string; buyers: string; roles: string }> = await ctx.q(
    `SELECT upper(c.ticker) AS ticker,
            SUM(t."totalValue")::text AS value,
            COUNT(DISTINCT t."insiderName")::text AS buyers,
            string_agg(DISTINCT COALESCE(t.role,''), '|') AS roles
       FROM insider_transactions t
       JOIN companies c ON c.id = t.company_id
      WHERE t."transactionCode" = 'P'
        AND t."totalValue" > 0
        AND c.ticker IS NOT NULL AND c.ticker <> ''
        -- The modelled filing date, never the transaction date.
        AND (t."transactionDate" + $2::int) <= $1::date
        AND t."transactionDate" >= ($1::date - $3::int)
      GROUP BY 1`,
    [ymd(asOfMs), FORM4_LAG_DAYS, windowDays],
  );
  return rows.map((r) => ({
    ticker: r.ticker,
    value: Number(r.value) || 0,
    buyers: Number(r.buyers) || 0,
    roles: String(r.roles || '').split('|').filter(Boolean),
  }));
}

/** Is the last close above the 200-day average? §2.1's one variant that worked. */
function inUptrend(ctx: SelectorContext, ticker: string, asOfMs: number): boolean {
  const pts = ctx.prices.get(ticker);
  if (!pts?.length) return false;
  let end = -1;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] <= asOfMs) end = i;
    else break;
  }
  if (end < 20) return false;
  const start = Math.max(0, end - 199);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    if (pts[i][1] > 0) {
      sum += pts[i][1];
      n++;
    }
  }
  if (!n) return false;
  return pts[end][1] > sum / n;
}

/** 7. Insider Buying — S&P 500. The variant §2.1 found actually worked. */
export const INSIDER_SP500: StrategyDef = {
  slug: 'insider-buying-sp500',
  name: 'Insider Buying — S&P 500',
  dataset: 'Insiders',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: FORM4_LAG_DAYS,
  rulesPlain:
    'Hold the ten S&P 500 companies with the largest open-market insider purchases by dollar value in the last 90 days, but only where the stock is trading above its own 200-day average. Equally weighted, rebalanced monthly, and published beside a plain buy-and-hold S&P 500 line.',
  params: { lookbackDays: 90, topN: 10, weighting: 'equal', trendFilterDays: 200, universe: 'sp500' },
  limitations: [
    ...FORM4_LIMITS,
    'S&P 500 membership is read as it stands today, not as it stood on each historical date. Companies added recently appear as members throughout, and companies dropped along the way are missing entirely — a survivorship bias this backtest cannot remove.',
    'The trend filter is the one variant of five that beat buy-and-hold in the public test this brief cites. It was chosen because of that test, so it is a parameter fitted on somebody else’s result and not on ours.',
  ],
  async select(ctx, asOfMs) {
    const rows = await insiderBuys(ctx, asOfMs, 90);
    return rows
      .filter((r) => ctx.sp500.has(r.ticker) && inUptrend(ctx, r.ticker, asOfMs))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((r): Pick => ({
        ticker: r.ticker,
        weight: 1,
        trigger: `$${(r.value / 1e6).toFixed(1)}m bought by ${r.buyers} insider${r.buyers === 1 ? '' : 's'}, above its 200-day average`,
      }));
  },
};

/** 8. S&P 500 + Insider Buying — the fund's anchor sleeve logic. */
export const SP500_PLUS_INSIDER: StrategyDef = {
  slug: 'sp500-plus-insider-buying',
  name: 'S&P 500 + Insider Buying',
  dataset: 'Insiders',
  version: '1.0.0',
  rebalanceDays: 90,
  disclosureLagDays: FORM4_LAG_DAYS,
  rulesPlain:
    'Hold the largest S&P 500 companies by market value that also carry recent open-market insider buying, weighted by market value. This is the anchor-sleeve logic from the fund, published so the index weighting and the insider filter can be judged separately. Rebalanced quarterly.',
  params: { lookbackDays: 180, topN: 20, weighting: 'market-cap', universe: 'sp500' },
  limitations: [
    ...FORM4_LIMITS,
    'S&P 500 membership and market capitalisation are both current values, not point-in-time ones, so the weighting on a 2019 date is built from what those companies are worth now.',
  ],
  async select(ctx, asOfMs) {
    const rows = await insiderBuys(ctx, asOfMs, 180);
    return rows
      .filter((r) => ctx.sp500.has(r.ticker) && (ctx.marketCap.get(r.ticker) ?? 0) > 0)
      .sort((a, b) => (ctx.marketCap.get(b.ticker) ?? 0) - (ctx.marketCap.get(a.ticker) ?? 0))
      .slice(0, 20)
      .map((r): Pick => ({
        ticker: r.ticker,
        weight: ctx.marketCap.get(r.ticker) ?? 0,
        trigger: `Index-weight name with $${(r.value / 1e6).toFixed(1)}m of insider buying`,
      }));
  },
};

/** 9. CEO Conviction — buy size against pay. */
export const CEO_CONVICTION: StrategyDef = {
  slug: 'ceo-conviction',
  name: 'CEO Conviction',
  dataset: 'Insiders',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: FORM4_LAG_DAYS,
  rulesPlain:
    'Hold the fifteen companies where the chief executive bought the most stock relative to their own annual pay in the last 180 days. A chief executive buying a year of salary is a different act from one buying a rounding error. Equally weighted, rebalanced monthly.',
  params: { lookbackDays: 180, topN: 15, weighting: 'equal', minRatio: 0.25 },
  limitations: [
    ...FORM4_LIMITS,
    'Executive pay comes from the latest proxy on file and is matched to the buyer by role, not by name, so a company with two people carrying a chief-executive title in one year may be measured against the wrong salary.',
    'Companies with no pay data on file cannot produce a ratio and are absent rather than ranked last.',
  ],
  async select(ctx, asOfMs) {
    const rows: Array<{ ticker: string; value: string; name: string }> = await ctx.q(
      `SELECT upper(c.ticker) AS ticker, SUM(t."totalValue")::text AS value,
              MIN(t."insiderName") AS name
         FROM insider_transactions t
         JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P' AND t."totalValue" > 0
          AND (t.role ILIKE '%CEO%' OR t.role ILIKE '%Chief Executive%'
               OR t."rawTitle" ILIKE '%Chief Executive%')
          AND (t."transactionDate" + $2::int) <= $1::date
          AND t."transactionDate" >= ($1::date - $3::int)
          AND c.ticker IS NOT NULL AND c.ticker <> ''
        GROUP BY 1`,
      [ymd(asOfMs), FORM4_LAG_DAYS, 180],
    );
    if (!rows.length) return [];
    const payRows: Array<{ symbol: string; pay: string }> = await ctx
      .q(
        `SELECT DISTINCT ON (upper(symbol)) upper(symbol) AS symbol, total::text AS pay
           FROM exec_compensation
          WHERE total > 0 AND year IS NOT NULL
          ORDER BY upper(symbol), year DESC`,
      )
      .catch((e: any) => {
        // Swallowing this is how three schema mistakes reached production
        // looking like empty datasets. The engine records a selector failure
        // as a run note, which is a visible answer; [] is a silent wrong one.
        throw new Error(`selector query failed: ${e?.message || e}`);
      });
    const pay = new Map<string, number>();
    for (const r of payRows) pay.set(r.symbol, Number(r.pay) || 0);
    return rows
      .map((r) => {
        const salary = pay.get(r.ticker) || 0;
        const value = Number(r.value) || 0;
        return { ticker: r.ticker, value, name: r.name, ratio: salary > 0 ? value / salary : null };
      })
      .filter((r) => r.ratio != null && (r.ratio as number) >= 0.25)
      .sort((a, b) => (b.ratio as number) - (a.ratio as number))
      .slice(0, 15)
      .map((r): Pick => ({
        ticker: r.ticker,
        weight: 1,
        trigger: `${r.name} bought ${((r.ratio as number)).toFixed(1)}× annual pay`,
      }));
  },
};

/** 10. Insider Clusters — Small & Mid Cap. */
export const INSIDER_CLUSTERS: StrategyDef = {
  slug: 'insider-clusters-smid',
  name: 'Insider Clusters — Small & Mid Cap',
  dataset: 'Insiders',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: FORM4_LAG_DAYS,
  rulesPlain:
    'Hold companies under $10bn where three or more separate insiders bought on the open market inside a fourteen-day window. Equally weighted, top fifteen by total dollars bought, rebalanced monthly.',
  params: { clusterWindowDays: 14, minBuyers: 3, maxMarketCapUsd: 10_000_000_000, topN: 15, weighting: 'equal' },
  limitations: [
    ...FORM4_LIMITS,
    'Market capitalisation is the current value, so a company that has grown past $10bn since is excluded from earlier dates where it would have qualified.',
    'Canadian SEDI filings are not ingested, so this is United States insiders only despite the rule set allowing for both.',
  ],
  async select(ctx, asOfMs) {
    const rows = await insiderBuys(ctx, asOfMs, 14);
    return rows
      .filter((r) => {
        const mc = ctx.marketCap.get(r.ticker) ?? 0;
        return r.buyers >= 3 && mc > 0 && mc < 10_000_000_000;
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
      .map((r): Pick => ({
        ticker: r.ticker,
        weight: 1,
        trigger: `${r.buyers} insiders bought $${(r.value / 1e6).toFixed(1)}m within 14 days`,
      }));
  },
};

/** 11. Contrarian Insiders — buying into weakness. */
export const CONTRARIAN_INSIDERS: StrategyDef = {
  slug: 'contrarian-insiders',
  name: 'Contrarian Insiders',
  dataset: 'Insiders',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: FORM4_LAG_DAYS,
  rulesPlain:
    'Hold companies where insiders bought on the open market while the stock sat at least 30% below its own 52-week high. Equally weighted, top fifteen by dollars bought, rebalanced monthly.',
  params: { lookbackDays: 90, minDrawdownPct: 30, topN: 15, weighting: 'equal' },
  limitations: [
    ...FORM4_LIMITS,
    'The 52-week high is measured from our own daily closes, so a name whose series starts late has a shallower high and can fail the test for the wrong reason.',
  ],
  async select(ctx, asOfMs) {
    const rows = await insiderBuys(ctx, asOfMs, 90);
    const out: Array<Pick & { value: number }> = [];
    for (const r of rows) {
      const pts = ctx.prices.get(r.ticker);
      if (!pts?.length) continue;
      let end = -1;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] <= asOfMs) end = i;
        else break;
      }
      if (end < 0) continue;
      const yearAgo = asOfMs - 365 * 86_400_000;
      let high = 0;
      for (let i = end; i >= 0 && pts[i][0] >= yearAgo; i--) high = Math.max(high, pts[i][1]);
      const last = pts[end][1];
      if (!(high > 0) || !(last > 0)) continue;
      const offHigh = ((high - last) / high) * 100;
      if (offHigh < 30) continue;
      out.push({
        ticker: r.ticker,
        weight: 1,
        value: r.value,
        trigger: `${offHigh.toFixed(0)}% below its 52-week high with $${(r.value / 1e6).toFixed(1)}m of insider buying`,
      });
    }
    return out.sort((a, b) => b.value - a.value).slice(0, 15).map(({ value, ...p }) => p);
  },
};

/** 12. Conviction Metals — the Runbook's metals mandate. */
export const CONVICTION_METALS: StrategyDef = {
  slug: 'conviction-metals',
  name: 'Conviction Metals',
  dataset: 'Sector',
  version: '1.1.0',
  rebalanceDays: 90,
  disclosureLagDays: FORM4_LAG_DAYS,
  rulesPlain:
    'Hold metals and mining companies carrying open-market insider buying, allocated to the runbook mandate: 10% to gold, 25% to junior miners, the remainder across the rest of the sector. Weighted by dollars bought inside each bucket and capped so no single name dominates. Rebalanced quarterly.',
  params: {
    lookbackDays: 180,
    topN: 20,
    goldAllocationPct: 10,
    juniorAllocationPct: 25,
    juniorMaxMarketCapUsd: 500_000_000,
    maxWeightPct: 10,
  },
  limitations: [
    ...FORM4_LIMITS,
    'The sector universe is the security master\'s own mining industries — Gold, Other Precious Metals, Copper, Silver, Steel, Aluminum, Uranium and Coal. An earlier version matched any industry containing the word "metal", which swept in metal fabricators, construction materials and waste management: companies that are not miners.',
    'JUNIOR IS A PROXY. The runbook means exploration-stage miners, and nothing in our data marks a company as exploration-stage, so a junior here is a mining company under $500m of market value. That captures most juniors and will also capture a few small producers. Market capitalisation is also the current value, not the value on each historical date.',
    'Canadian SEDI filings are not ingested, and a large share of the world\'s junior miners are Canadian-listed, so the junior bucket draws from a much narrower pool than the mandate intends and will often hold fewer names than its allocation allows.',
  ],
  async select(ctx, asOfMs) {
    const rows = await insiderBuys(ctx, asOfMs, 180);
    const secRows: Array<{ symbol: string; industry: string }> = await ctx
      .q(
        `SELECT upper(symbol) AS symbol, COALESCE(industry,'') AS industry
           FROM pit_securities
          WHERE industry IN ('Gold','Other Precious Metals','Silver','Copper','Steel','Aluminum','Uranium','Coal')`,
      )
      .catch((e: any) => {
        throw new Error(`conviction-metals universe query failed: ${e?.message || e}`);
      });
    const industryOf = new Map<string, string>();
    for (const r of secRows) industryOf.set(r.symbol, r.industry);

    const inSector = rows.filter((r) => industryOf.has(r.ticker));
    if (!inSector.length) return [];

    // Three buckets, in the runbook's own proportions. A name is a junior
    // first and gold second, so a sub-$500m gold explorer is counted once.
    const JUNIOR_CAP = 500_000_000;
    const junior = inSector.filter((r) => (ctx.marketCap.get(r.ticker) ?? Infinity) < JUNIOR_CAP);
    const juniorSet = new Set(junior.map((r) => r.ticker));
    const gold = inSector.filter((r) => industryOf.get(r.ticker) === 'Gold' && !juniorSet.has(r.ticker));
    const goldSet = new Set(gold.map((r) => r.ticker));
    const rest = inSector.filter((r) => !juniorSet.has(r.ticker) && !goldSet.has(r.ticker));

    const buckets: Array<{ names: typeof inSector; share: number; label: string }> = [
      { names: gold, share: 0.10, label: 'gold' },
      { names: junior, share: 0.25, label: 'junior miner' },
      { names: rest, share: 0.65, label: 'metals & mining' },
    ];
    // An empty bucket's share is redistributed rather than left in cash: the
    // mandate is a target allocation, and holding 25% cash because no junior
    // qualified would be a different strategy from the one published.
    const live = buckets.filter((b) => b.names.length);
    const shareSum = live.reduce((a, b) => a + b.share, 0) || 1;

    const picks: Pick[] = [];
    for (const b of live) {
      const take = b.names.sort((x, y) => y.value - x.value).slice(0, 20);
      const total = take.reduce((a, r) => a + r.value, 0) || 1;
      const bucketShare = b.share / shareSum;
      for (const r of take) {
        picks.push({
          ticker: r.ticker,
          // Capped at 10% of the whole sleeve so one large buy cannot become it.
          weight: Math.min((r.value / total) * bucketShare, 0.1),
          trigger: `$${(r.value / 1e6).toFixed(1)}m of insider buying — ${b.label}`,
        });
      }
    }
    return picks;
  },
};

export const INSIDER_STRATEGIES = [
  INSIDER_SP500,
  SP500_PLUS_INSIDER,
  CEO_CONVICTION,
  INSIDER_CLUSTERS,
  CONTRARIAN_INSIDERS,
  CONVICTION_METALS,
];
