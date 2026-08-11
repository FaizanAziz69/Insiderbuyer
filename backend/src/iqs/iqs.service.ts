import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { IqsScore } from '../entities/iqs-score.entity';
import { normalizeRole } from '../common/role.util';
import { CongressionalService } from '../congressional/congressional.service';
import { FmpService } from '../fmp/fmp.service';
import { SecClient } from '../ingestion/sec.client';
import { MarketStatsService } from '../market-stats/market-stats.service';
import {
  CompositeScore,
  analystPillarScore,
  computeCompositeScore,
  topStocksScore,
} from './composite-score';
import { SentimentService } from './sentiment.service';
import { SectorSentimentService } from './sector-sentiment.service';
import {
  BUYING_SUBWEIGHTS,
  COMPONENT_WEIGHTS,
  NEUTRAL,
  PEDIGREE_BASELINE,
  PEDIGREE_FLAG_POINTS,
  PEOPLE_SIGNALS_LIVE,
  PLANNED_BUY_MULTIPLIER,
  ROLE_MULTIPLIER,
  NORM,
  SCORE_CEILING,
  WINDOWS,
} from './scoring-config';
import {
  LitigationMatterInput,
  PedigreeInsiderInput,
  assembleComposite,
  computeBuyingScore,
  computeLitigationDeduction,
  computePedigreeScore,
  scoreBuySellBalance,
  scoreCluster,
  scoreDilution,
  scoreHoldingChange,
  scoreInsiderOwnership,
  scoreMomentum,
  scorePriceVsBuys,
  scoreRole,
  scoreStakeIncrease,
  scoreVolumeVsMarketCap,
} from './iq-score-v2';
import { InsiderProfile } from '../entities/insider-profile.entity';

export interface RankingRow {
  rank: number;
  companyId: string;
  ticker: string | null;
  name: string;
  sector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
  /** Listing group: 'US' | 'CA' | 'DE' … — drives the Exchanges filter and
   *  gates which companies are eligible for generated articles. */
  exchange: string | null;
  iqs: number; // 0–100 (v2 composite)
  insiderWeight: number;
  transactionWeight: number;
  convictionWeight: number;
  historicalSuccessWeight: number;
  clusterWeight: number;
  marketTimingWeight: number;
  distinctBuyers: number;
  transactionCount: number;
  totalPurchaseValue: number;
  /** TipRanks-style one-liner: who bought, how much, stake growth, ownership. */
  reasoning?: string | null;
  // ── v2.1 people-signals + new sub-factors (stored; dark until live) ────
  pedigreeScore?: number | null;
  litigationDeduction?: number | null;
  subInsiderOwnership?: number | null;
  subBuySellBalance?: number | null;
  // ── IQ Score v2 component breakdown (explainability) ──────────────────
  buyingScore?: number | null;
  sectorSentiment?: number | null;
  mdaSentiment?: number | null;
  momentumScore?: number | null;
  dilutionScore?: number | null;
  dataCompleteness?: number | null;
  subVolumeVsMcap?: number | null;
  subCluster?: number | null;
  subRole?: number | null;
  subHoldingChange?: number | null;
  subPriceVsBuys?: number | null;
  subOwnershipPct?: number | null;
  /** Category flags for the insider-type filter — true when at least one
   *  open-market ('P') buyer of this company matches the category. */
  hasCeoBuyer?: boolean;
  hasCfoBuyer?: boolean;
  /** A fund / institutional filer (name looks like an entity, e.g. Capital,
   *  Partners, LP, Management) is among the buyers — used for "Hedge Funds". */
  hasFundBuyer?: boolean;
  /** Volume-weighted average insider purchase price (Σ shares×price / Σ shares)
   *  across this company's open-market Form 4 buys. */
  avgCost?: number | null;
  /** Most recent open-market insider purchase date (yyyy-mm-dd). */
  lastBuyDate?: string | null;
  /** Real intraday change % — merged from the live quote feed when the
   *  caller passes withLive (null when no quote is available). */
  changePct?: number | null;
  livePrice?: number | null;
  /** When this score row was last recomputed (ISO). */
  scoreUpdatedAt?: string | null;
  /** Aggregate insider ownership % + its change over the buy window (pp). */
  insiderOwnershipPct?: number | null;
  insiderOwnershipChangePct?: number | null;
  /** % the live price sits above/below the 90-day insider avg cost. */
  perfVsAvgCostPct?: number | null;
  /** At least one insider made >1 open-market buy in the last 90 days. */
  hasRepeatBuyer?: boolean;
}

// Role multipliers (ROLE_MULTIPLIER) now live in scoring-config.ts so product
// can tune them without a code change — imported above.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Normalize an "Exchanges" filter value to a stored Company.exchange code,
 *  or null for "All" / unknown (no filter). Accepts UI labels and codes:
 *  us/u.s./united states→US, ca/canada→CA, de/germany/deutschland→DE. */
function normalizeExchange(raw?: string): string | null {
  const v = (raw || '').trim().toLowerCase();
  if (!v || v === 'all') return null;
  if (/^(us|u\.s\.?|usa|united states)$/.test(v)) return 'US';
  if (/^(ca|canada|canadian)$/.test(v)) return 'CA';
  if (/^(de|germany|german|deutschland)$/.test(v)) return 'DE';
  return null;
}

// ── Data-quality guards ──────────────────────────────────────────────────
// A single open-market Form 4 purchase above MAX_PLAUSIBLE_TX_VALUE is almost
// certainly a parse artifact — such rows are excluded from score aggregates
// so one bad filing can't distort them. The shared predicate lives in
// tx-sanity.ts so every surface (scores, feeds, articles) agrees.
import { isPlausibleTx, plausibleTxSql, MAX_PLAUSIBLE_TX_VALUE } from './tx-sanity';

/** Null out a market cap that is impossible against observed insider buying —
 *  insiders cannot buy more dollars of stock than the whole company is worth.
 *  (Happens when the SEC-derived fallback cap uses stale/wrong shares
 *  outstanding.) Returning null makes the UI show "—" instead of bad data. */
function sanitizedMarketCap(
  marketCap: number | null | undefined,
  totalPurchaseValue: number,
): number | null {
  const cap = Number(marketCap) || 0;
  if (cap <= 0) return null;
  if (totalPurchaseValue > cap) return null;
  return cap;
}

@Injectable()
export class IqsService {
  private readonly logger = new Logger(IqsService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderTransaction) private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(IqsScore) private readonly scores: Repository<IqsScore>,
    @InjectRepository(InsiderProfile) private readonly profiles: Repository<InsiderProfile>,
    private readonly congress: CongressionalService,
    private readonly marketStats: MarketStatsService,
    private readonly fmp: FmpService,
    private readonly sec: SecClient,
    private readonly sentiment: SentimentService,
    private readonly sectorSentiment: SectorSentimentService,
  ) {}

  // Live SEC Form 4 lookups for tickers not in our ingested set (cached 30m).
  private liveTxCache = new Map<string, { ts: number; data: any[] }>();

  /** Recent insider transactions (buys + sells) for a ticker, fetched live
   *  from SEC EDGAR and shaped like our stored transactions. Used so any
   *  company page shows real Form 4 activity, not just our ingested subset. */
  private async getLiveInsiderTx(ticker: string): Promise<any[]> {
    const sym = (ticker || '').toUpperCase();
    if (!sym) return [];
    const cached = this.liveTxCache.get(sym);
    if (cached && Date.now() - cached.ts < 30 * 60_000) return cached.data;
    let data: any[] = [];
    try {
      const raw = await this.sec.getRecentForm4ByTicker(sym, 14);
      data = raw.map((t, i) => {
        const shares = Number(t.sharesBought) || 0;
        const price = Number(t.pricePerShare) || 0;
        const isSell = t.transactionCode === 'S';
        const role = t.rawTitle || (t.isDirector ? 'Director' : t.isOfficer ? 'Officer' : 'Insider');
        return {
          id: `sec-${sym}-${i}`,
          insiderName: t.insiderName,
          role,
          rawTitle: t.rawTitle || '',
          transactionCode: t.transactionCode,
          type: isSell ? 'SELL' : 'BUY',
          plannedBuy: (t as any).plannedBuy === true,
          sharesBought: shares,
          pricePerShare: price,
          totalValue: +(shares * price).toFixed(2),
          previousHoldings: null,
          postHoldings: t.postHoldings ?? null,
          transactionDate: t.transactionDate,
          filingUrl: this.form4Link(t.filingUrl, (t as any).accessionNumber ?? null),
        };
      });
    } catch {
      data = [];
    }
    this.liveTxCache.set(sym, { ts: Date.now(), data });
    return data;
  }

  /** IQ Score v2 — 0–100 composite (see scoring-config.ts / iq-score-v2.ts):
   *
   *   IQ = 0.50·Buying + 0.25·Sector + 0.10·MD&A + 0.10·Momentum + 0.05·Dilution
   *
   *  Buying is itself a 6-sub-factor composite (volume/mcap, cluster, role,
   *  holding change, avg-buy-price-vs-current, ownership %). Sector, MD&A and
   *  dilution read precomputed inputs (sector cache / company.mdaSentiment /
   *  company.dilutionPctTtm) so the per-company loop stays inside the 60s
   *  serverless budget. Only open-market purchases (code P) feed the Buying
   *  component; missing components degrade to neutral 50 (dataCompleteness). */
  async recalculateAll(
    windowDays = WINDOWS.buys,
    opts?: { limit?: number; after?: string },
  ): Promise<{ updated: number; remaining: number; cursor: string | null }> {
    const since = new Date(Date.now() - windowDays * 86400000);
    const seasonedCutoff = new Date(Date.now() - WINDOWS.seasoned * 86400000);
    const today = new Date().toISOString().slice(0, 10);
    const allCompanies = await this.companies.find();
    // Sliceable: when a limit is given, walk the universe alphabetically by
    // ticker from `after` — lets a 60s serverless call score a chunk and a
    // GitHub-Actions loop cover everything without a local worker.
    let companies = allCompanies;
    let remaining = 0;
    let cursor: string | null = null;
    if (opts?.limit && opts.limit > 0) {
      const after = opts.after || '';
      const sorted = allCompanies
        .filter((c) => (c.ticker || c.id) > after)
        .sort((a, b) => (a.ticker || a.id).localeCompare(b.ticker || b.id));
      companies = sorted.slice(0, opts.limit);
      remaining = Math.max(0, sorted.length - companies.length);
      cursor = companies.length ? companies[companies.length - 1].ticker || companies[companies.length - 1].id : null;
    }
    let updated = 0;

    // Warm the daily sector-sentiment cache once (11 ETF fetches) so the
    // per-company lookups below are synchronous cache hits.
    await this.sectorSentiment.getScores().catch(() => new Map());

    // One quote batch for price, market cap, 52-week ranges + volume momentum.
    let quotes = new Map<string, any>();
    try {
      const tickers = companies.map((c) => c.ticker).filter(Boolean) as string[];
      quotes = await this.marketStats.getQuoteBatch(tickers);
    } catch {
      quotes = new Map();
    }

    // v2.1 §6/§7 — insider profiles (pedigree flags + litigation matters).
    // Review gate (§6.3.4/§7.3): only ANALYST-CONFIRMED profiles (reviewedBy
    // set) ever influence a score — unreviewed research stays inert. Keyed by
    // reporting-person CIK first (§6.3.1), lowercased name as legacy fallback.
    const profByCik = new Map<string, { flags: string[]; matters: LitigationMatterInput[] }>();
    const profByName = new Map<string, { flags: string[]; matters: LitigationMatterInput[] }>();
    try {
      const rows = await this.profiles
        .createQueryBuilder('p')
        .where('p.suppressed = false')
        .andWhere('p."reviewedBy" IS NOT NULL')
        .getMany();
      for (const p of rows) {
        const parsed = {
          flags: JSON.parse(p.flags || '[]'),
          matters: JSON.parse(p.litigationMatters || '[]'),
        };
        if (p.cik) profByCik.set(p.cik, parsed);
        profByName.set(p.nameKey, parsed);
      }
    } catch {
      /* profiles unavailable → pedigree baseline everywhere */
    }

    // Per-company work is independent — run in small parallel batches so a
    // full-universe recalc over a remote DB takes minutes, not an hour.
    const processCompany = async (company: Company) => {
      // Unlisted Form 4 filers (private credit funds, trusts — ticker absent
      // or a literal "N/A"/"NONE") are not tradeable stocks: never score
      // them, and clear any score row a previous run left behind.
      const tkr = (company.ticker || '').trim().toUpperCase();
      const isFundTicker = /^[A-Z]{4}X$/.test(tkr); // NASDAQ mutual-fund class
      const malformed = !tkr || /[^A-Z0-9.\-]/.test(tkr);
      if (malformed || tkr === 'N/A' || tkr === 'NONE' || isFundTicker) {
        await this.scores.delete({ companyId: company.id });
        return;
      }
      const allTxs = await this.txRepo
        .createQueryBuilder('t')
        .where('t.company_id = :id', { id: company.id })
        .andWhere('t.transactionDate >= :since', { since })
        .andWhere(`t."transactionCode" IN ('P','S')`)
        .getMany();

      // Round-trip guard: an "insider" who sells back a large share of what
      // they bought inside the window (market makers, wash-style flipping —
      // e.g. buy 6M shares, dump 3.7M two days later) shows zero conviction.
      // Exclude that insider's buys entirely so such names can't top the
      // rankings and feed contradictory articles.
      const sharesBySide = new Map<string, { buy: number; sell: number }>();
      for (const t of allTxs) {
        const key = t.insiderName.toLowerCase();
        const e = sharesBySide.get(key) || { buy: 0, sell: 0 };
        const sh = Number(t.sharesBought) || 0;
        if (t.transactionCode === 'P') e.buy += sh;
        else e.sell += sh;
        sharesBySide.set(key, e);
      }
      const isRoundTripper = (insider: string): boolean => {
        const e = sharesBySide.get(insider.toLowerCase());
        if (!e || e.buy <= 0) return false;
        return e.sell >= e.buy * 0.5; // sold back ≥50% of window buys
      };

      const txs = allTxs.filter(
        (t) => t.transactionCode === 'P' && !isRoundTripper(t.insiderName),
      );

      if (!txs.length) {
        await this.scores.delete({ companyId: company.id });
        return;
      }

      // Insider selling dollars over the same window — feeds the Buy/Sell
      // Balance sub-factor (same parse guard as the buy side).
      let totalSellValue = 0;
      for (const t of allTxs) {
        if (t.transactionCode !== 'S') continue;
        const v = Number(t.sharesBought) * Number(t.pricePerShare);
        if (Number.isFinite(v) && v > 0 && v <= MAX_PLAUSIBLE_TX_VALUE) totalSellValue += v;
      }

      // Prefer the LIVE market quote for price + market cap; fall back to the
      // SEC-derived values (shares outstanding × last Form 4 price) only when
      // no live quote is available. This keeps market cap and the
      // "currently in profit" check anchored to the real current price rather
      // than the most-recent insider transaction price.
      const liveQ = company.ticker ? quotes.get(company.ticker.toUpperCase()) : null;
      const secPrice = company.lastPrice ? Number(company.lastPrice) : 0;
      const secMarketCap = company.marketCap ? Number(company.marketCap) : 0;
      const lastPrice = liveQ?.price && liveQ.price > 0 ? liveQ.price : secPrice;
      const marketCap =
        liveQ?.marketCap && liveQ.marketCap > 0 ? liveQ.marketCap : secMarketCap;

      // Persist the live values back onto the company so the rest of the site
      // (quote cards, rankings, stock lists) shows the real current price/cap.
      if (liveQ && (liveQ.price > 0 || (liveQ.marketCap ?? 0) > 0)) {
        const nextPrice = lastPrice;
        const nextCap = marketCap ? String(Math.round(marketCap)) : company.marketCap;
        if (Number(company.lastPrice) !== nextPrice || company.marketCap !== nextCap) {
          company.lastPrice = nextPrice as unknown as number;
          company.marketCap = nextCap as unknown as string;
          await this.companies.save(company);
        }
      }

      let totalPurchaseValue = 0; // Σ shares × price (raw dollars — display/VWAP)
      let signalValue = 0; // Σ value × plan discount (drives sub-factor A)
      let totalShares = 0; // Σ shares (for insider VWAP)
      let roleWeightedValue = 0; // Σ value × role multiplier × plan discount
      const buyers = new Set<string>();
      const holdingChangePcts: number[] = []; // D: per-buyer % add
      // F: role-weighted ownership % increase
      let ownWeightedSum = 0;
      let ownWeightSum = 0;

      for (const t of txs) {
        const shares = Number(t.sharesBought);
        const px = Number(t.pricePerShare);
        const value = shares * px;
        // Shared data-quality guard (tx-sanity.ts): absolute-value bound plus
        // the 25×-live-price sanity check, so one bad filing can't blow up
        // the aggregates (and the market-cap check below).
        if (!isPlausibleTx(shares, px, lastPrice)) {
          continue;
        }
        const roleMult = ROLE_MULTIPLIER[t.role] ?? ROLE_MULTIPLIER.Other;
        // Rule 10b5-1(c) plan buys are pre-scheduled, not a conviction signal —
        // they count at PLANNED_BUY_MULTIPLIER weight in A and C (spec).
        const planMult = t.plannedBuy ? PLANNED_BUY_MULTIPLIER : 1;
        totalPurchaseValue += value;
        signalValue += value * planMult;
        totalShares += shares;
        roleWeightedValue += value * roleMult * planMult;
        buyers.add(t.insiderName.toLowerCase());
        const prevRaw = t.previousHoldings;
        const prev = Number(prevRaw) || 0;
        if (prev > 0) {
          const frac = shares / prev; // relative stake growth
          holdingChangePcts.push(frac * 100); // D (percent)
          ownWeightedSum += Math.min(frac, NORM.ownershipPctCap) * roleMult; // F
          ownWeightSum += roleMult;
        } else {
          // First-time buyer (held 0 before) — maximum relative commitment
          // in BOTH stake metrics (F caps at doubling; D caps at 100%), so
          // D and F never contradict each other on the same filer.
          if (prevRaw != null && shares > 0) holdingChangePcts.push(100);
          ownWeightedSum += NORM.ownershipPctCap * roleMult;
          ownWeightSum += roleMult;
        }
      }

      // Every window buy was a guarded-out artifact → the company has no
      // REAL qualifying buying; drop it from the ranking exactly like the
      // no-transactions case (matches the explainer's "no score" behavior).
      if (totalPurchaseValue <= 0 || buyers.size === 0) {
        await this.scores.delete({ companyId: company.id });
        return;
      }

      // Data-quality guard: a cap smaller than the observed insider buying is
      // impossible — treat it as unknown rather than producing absurd factors.
      const safeCap = sanitizedMarketCap(marketCap, totalPurchaseValue) ?? 0;
      const insiderVwap = totalShares > 0 ? totalPurchaseValue / totalShares : null;

      // ── Component 1: Insider Buying (v2.1 sub-factors A–G, each 0–100) ──
      const subVolume = scoreVolumeVsMarketCap(safeCap > 0 ? signalValue / safeCap : null);
      const subCluster = scoreCluster(buyers.size);
      const subRole = scoreRole(safeCap > 0 ? roleWeightedValue / safeCap : null);
      // D — holding change (absolute commitment).
      const subHolding = scoreHoldingChange(
        holdingChangePcts.length
          ? holdingChangePcts.reduce((a, b) => a + b, 0) / holdingChangePcts.length
          : null,
      );
      const subPriceVsBuys = scorePriceVsBuys(insiderVwap, lastPrice > 0 ? lastPrice : null);
      // F — ownership increase per insider (relative stake growth).
      const subStake = scoreStakeIncrease(
        ownWeightSum > 0 ? ownWeightedSum / ownWeightSum : null,
      );
      // G (NEW v2.1) — aggregate insider ownership: latest reported
      // post-transaction holdings per individual filer in the window
      // (fund-style 10%-owner filers excluded) over REAL shares outstanding
      // (SEC XBRL, stored at ingest) with the market-cap ÷ price proxy as
      // the fallback. Filers dedupe by reporting-person CIK (§6.3.1), name
      // only for legacy rows without one.
      const latestHolding = new Map<string, { date: string; shares: number }>();
      // Net shares the SAME counted (fund-excluded) insiders traded in the
      // window — buys add, sells subtract. Used for the 90-day ownership
      // change so it reconciles with the ownership % (same population).
      let netCountedWindowShares = 0;
      for (const t of allTxs) {
        if (IqsService.FUND_NAME.test(t.insiderName)) continue;
        const sh = Number(t.sharesBought) || 0;
        if (t.transactionCode === 'P') netCountedWindowShares += sh;
        else if (t.transactionCode === 'S') netCountedWindowShares -= sh;
        const post = Number(t.postHoldings);
        if (!Number.isFinite(post) || post < 0) continue;
        const key = t.insiderCik || t.insiderName.trim().toLowerCase();
        const d = String(t.transactionDate);
        const cur = latestHolding.get(key);
        if (!cur || d > cur.date) latestHolding.set(key, { date: d, shares: post });
      }
      const insiderShares = [...latestHolding.values()].reduce((a, b) => a + b.shares, 0);
      const realSharesOut = Number(company.sharesOutstanding) || 0;
      const sharesOut =
        realSharesOut > 0
          ? realSharesOut
          : lastPrice > 0 && marketCap > 0
            ? marketCap / lastPrice
            : 0;
      // null only when holdings DATA is missing; a measured ~0% scores 0.
      // A raw fraction near/above 100% is a denominator mismatch (ADR ratio,
      // stale share count) — no real company is ~100% insider-held via Form 4
      // postHoldings — so treat it as unknown rather than assert "100%".
      const hasHoldingsData = latestHolding.size > 0;
      const rawOwnFraction =
        hasHoldingsData && sharesOut > 0 ? insiderShares / sharesOut : null;
      const subOwnershipG = scoreInsiderOwnership(
        rawOwnFraction != null && rawOwnFraction <= 0.98 ? rawOwnFraction : null,
      );
      const subBalance = scoreBuySellBalance(totalPurchaseValue, totalSellValue);
      const buyingScore = computeBuyingScore({
        volumeVsMarketCap: subVolume,
        cluster: subCluster,
        role: subRole,
        holdingChange: subHolding,
        priceVsBuys: subPriceVsBuys,
        stakeIncrease: subStake,
        insiderOwnership: subOwnershipG,
        buySellBalance: subBalance,
      });

      // ── Component 5 (NEW v2.1 §6): Insider Pedigree + §7 litigation ─────
      // Profiles resolve by reporting-person CIK first (§6.3.1 — "never off
      // a bare name"), lowercased name only as the legacy fallback.
      const pedigreeInputs: PedigreeInsiderInput[] = [];
      const litigationMatters: LitigationMatterInput[] = [];
      const filerInfo = new Map<string, { roleMult: number; cik: string | null; nameKey: string }>();
      for (const t of allTxs) {
        const nameKey = t.insiderName.trim().toLowerCase();
        const key = t.insiderCik || nameKey;
        if (!filerInfo.has(key)) {
          filerInfo.set(key, {
            roleMult: ROLE_MULTIPLIER[t.role] ?? ROLE_MULTIPLIER.Other,
            cik: t.insiderCik || null,
            nameKey,
          });
        }
      }
      for (const info of filerInfo.values()) {
        const prof = (info.cik && profByCik.get(info.cik)) || profByName.get(info.nameKey);
        if (!prof) continue;
        pedigreeInputs.push({
          flags: prof.flags,
          roleMultiplier: info.roleMult,
          recentBuyer: buyers.has(info.nameKey), // bought inside the 90d window ⊂ 12mo
        });
        litigationMatters.push(...prof.matters);
      }
      const pedigreeScore = computePedigreeScore(pedigreeInputs, PEDIGREE_FLAG_POINTS);
      const litigationDeduction = computeLitigationDeduction(litigationMatters);

      // TipRanks-style one-line reasoning: who bought, how much, stake growth,
      // and current insider ownership.
      const rolesBought = new Set(txs.map((t) => t.role));
      const leaders = ['CEO', 'CFO', 'COO'].filter((r) => rolesBought.has(r as never));
      const avgAddPct = holdingChangePcts.length
        ? holdingChangePcts.reduce((a, b) => a + b, 0) / holdingChangePcts.length
        : null;
      const ownPct =
        rawOwnFraction != null && rawOwnFraction > 0 && rawOwnFraction <= 0.98
          ? rawOwnFraction * 100
          : null;
      const fmtUsd = (v: number) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(v);
      const reasoning =
        `${buyers.size} insider${buyers.size === 1 ? '' : 's'}` +
        `${leaders.length ? ` (incl. ${leaders.join(', ')})` : ''}` +
        ` bought ${fmtUsd(totalPurchaseValue)} across ${txs.length} filing${txs.length === 1 ? '' : 's'}` +
        ` in the last 90 days` +
        `${avgAddPct != null ? `, growing their personal stakes ~${Math.min(999, avgAddPct).toFixed(0)}% on average` : ''}` +
        `${ownPct != null ? `; insiders now hold ~${ownPct.toFixed(1)}% of the company` : ''}` +
        `${totalSellValue > 0 ? `. Insiders also sold ${fmtUsd(totalSellValue)} in the same window` : ''}.`;

      // ── Component 2: Sector Sentiment (from daily cache) ────────────────
      const sectorScore = await this.sectorSentiment
        .getScoreFor(company.sector, company.industry)
        .catch(() => null);

      // ── Component 3: MD&A / communications (precomputed, batch) ─────────
      const mdaScore = company.mdaSentiment != null ? Number(company.mdaSentiment) : null;

      // ── Component 4: Volume Momentum (short vs long avg dollar volume) ──
      // Proxy 20d/90d with the quote batch's 10-day vs 3-month avg volume so
      // the loop needs no extra per-company chart calls.
      const shortVol = Number(liveQ?.avgVol10d ?? 0);
      const longVol = Number(liveQ?.avgVolume ?? 0);
      const relVol = shortVol > 0 && longVol > 0 ? shortVol / longVol : null;
      const recentDollarVol =
        lastPrice > 0 && shortVol > 0 ? lastPrice * shortVol : null;
      const momentumScore = scoreMomentum(relVol, recentDollarVol);

      // ── Component 5: Dilution (precomputed TTM share growth) ────────────
      const dilutionScore = scoreDilution(
        company.dilutionPctTtm != null ? Number(company.dilutionPctTtm) : null,
      );

      // ── Composite (v2.1: weighted, missing → neutral 50 / pedigree
      //    baseline 25, then the §7 litigation deduction, floored at 0).
      //    §12 dark mode: until IQS_PEOPLE_SIGNALS_LIVE=true, pedigree and
      //    litigation are computed and STORED for the audit window but not
      //    APPLIED — every company scores on the pedigree baseline with no
      //    deduction, so the people-signals can be reviewed for false
      //    positives before touching the public number. ─────────────────────
      const composite = assembleComposite(
        {
          buying: buyingScore,
          sector: sectorScore,
          mda: mdaScore,
          momentum: momentumScore,
          pedigree: PEOPLE_SIGNALS_LIVE ? pedigreeScore : null,
          dilution: dilutionScore,
        },
        PEOPLE_SIGNALS_LIVE ? litigationDeduction : 0,
      );
      const iqs = composite.score ?? 0;

      // Legacy display columns (kept so existing UI keeps working) mapped to
      // their nearest v2 sub-factor; historical-success + market-timing are no
      // longer in the composite but still computed for the breakdown card.
      let historicalSuccessWeight = 50;
      if (lastPrice > 0) {
        const seasoned = await this.txRepo
          .createQueryBuilder('t')
          .where('t.company_id = :id', { id: company.id })
          .andWhere(`t."transactionCode" = 'P'`)
          .andWhere('t.transactionDate < :cut', { cut: seasonedCutoff })
          .getMany();
        if (seasoned.length >= 2) {
          const wins = seasoned.filter((t) => lastPrice > Number(t.pricePerShare)).length;
          historicalSuccessWeight = (wins / seasoned.length) * 100;
        }
      }
      let marketTimingWeight = 50;
      const hi = Number(liveQ?.fiftyTwoWeekHigh ?? 0);
      const lo = Number(liveQ?.fiftyTwoWeekLow ?? 0);
      const px = Number(liveQ?.price ?? lastPrice);
      if (hi > lo && px > 0) marketTimingWeight = (1 - clamp01((px - lo) / (hi - lo))) * 100;

      // ── Legacy v1 score (insider-only) — kept for A/B comparison. ───────
      // v1 = log(1 + A + B + C + D) scaled, where A=value/cap, B=log(1+buyers),
      // C=roleValue/cap, D=avg holding-change %.
      const vA = safeCap > 0 ? totalPurchaseValue / safeCap : 0;
      const vB = Math.log(1 + buyers.size);
      const vC = safeCap > 0 ? roleWeightedValue / safeCap : 0;
      const vD = holdingChangePcts.length
        ? holdingChangePcts.reduce((a, b) => a + b, 0) / holdingChangePcts.length
        : 0;
      const IQS_V1_LOG_SCALE = 6.5; // original v1 scaling divisor
      const iqsV1 = +Math.min(
        99,
        (Math.log(1 + vA + vB + vC + vD) / IQS_V1_LOG_SCALE) * 100,
      ).toFixed(2);

      const round2 = (x: number | null): number | null =>
        x == null ? null : +x.toFixed(2);

      const existing = await this.scores.findOne({
        where: { companyId: company.id, asOfDate: today },
      });
      const payload: Partial<IqsScore> = {
        companyId: company.id,
        asOfDate: today,
        iqsV1,
        // v2 components + sub-factors (explainability)
        buyingScore: round2(buyingScore),
        sectorSentiment: round2(sectorScore),
        mdaSentiment: round2(mdaScore),
        momentumScore: round2(momentumScore),
        pedigreeScore: round2(pedigreeScore),
        litigationDeduction: +litigationDeduction.toFixed(2),
        dilutionScore: round2(dilutionScore),
        dataCompleteness: +composite.dataCompleteness.toFixed(4),
        // v2.1 sub-factor column mapping: A/B/C as before, D holding change,
        // E price-vs-buys, F stake increase (subOwnershipPct), G aggregate
        // insider ownership (subInsiderOwnership).
        subVolumeVsMcap: round2(subVolume),
        subCluster: round2(subCluster),
        subRole: round2(subRole),
        subHoldingChange: round2(subHolding),
        subPriceVsBuys: round2(subPriceVsBuys),
        subOwnershipPct: round2(subStake),
        subInsiderOwnership: round2(subOwnershipG),
        insiderOwnershipPct: ownPct != null ? round2(ownPct) : null,
        // 90-day ownership change (pp), same counted population as ownPct;
        // null when ownership itself is unreliable, and bounded by the
        // current ownership so it can never exceed what insiders now hold.
        insiderOwnershipChangePct:
          ownPct != null && sharesOut > 0
            ? round2(
                Math.max(
                  -ownPct,
                  Math.min(ownPct, (netCountedWindowShares / sharesOut) * 100),
                ),
              )
            : null,
        subBuySellBalance: round2(subBalance),
        reasoning,
        // legacy display columns
        insiderWeight: +(subRole ?? 0).toFixed(2),
        transactionWeight: +(subVolume ?? 0).toFixed(2),
        convictionWeight: +(subStake ?? subHolding ?? 0).toFixed(2),
        historicalSuccessWeight: +historicalSuccessWeight.toFixed(2),
        clusterWeight: +(subCluster ?? 0).toFixed(2),
        marketTimingWeight: +marketTimingWeight.toFixed(2),
        iqs: +iqs.toFixed(2),
        distinctBuyers: buyers.size,
        transactionCount: txs.length,
        totalPurchaseValue,
      };
      if (existing) {
        await this.scores.update(existing.id, payload);
      } else {
        await this.scores.save(this.scores.create(payload));
      }
      updated++;
    };

    const CONCURRENCY = 8; // stay inside the default connection pool
    for (let i = 0; i < companies.length; i += CONCURRENCY) {
      await Promise.all(
        companies.slice(i, i + CONCURRENCY).map((c) =>
          processCompany(c).catch((e) =>
            this.logger.warn(`recalc failed for ${c.ticker || c.id}: ${e?.message || e}`),
          ),
        ),
      );
    }
    return { updated, remaining, cursor };
  }

  // Rankings results are heavy (a wide join over the whole scored universe plus
  // per-company Form 4 aggregations) and the underlying scores only change on
  // the ~6-hourly recalc, yet the hot/home pages re-fetch this constantly. An
  // in-memory cache keyed by the query shape collapses that repeated read —
  // the single biggest driver of database egress. Prices refresh on the next
  // window; a few minutes of staleness on a rankings table is invisible.
  private rankCache = new Map<string, { ts: number; data: { total: number; rows: RankingRow[] } }>();
  private readonly RANK_TTL_MS = 10 * 60_000;

  async getRankings(opts: {
    limit?: number;
    offset?: number;
    sector?: string;
    sectorMatch?: RegExp;
    minMarketCap?: number;
    maxMarketCap?: number;
    minIqs?: number;
    country?: string;
    exchange?: string;
    withLive?: boolean;
  }): Promise<{ total: number; rows: RankingRow[] }> {
    const cacheKey = JSON.stringify({
      l: opts.limit, o: opts.offset, s: opts.sector,
      sm: opts.sectorMatch?.source, mn: opts.minMarketCap, mx: opts.maxMarketCap,
      mi: opts.minIqs, c: opts.country, e: opts.exchange, lv: !!opts.withLive,
    });
    const hit = this.rankCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < this.RANK_TTL_MS) return hit.data;

    const limit = Math.min(opts.limit ?? 50, 5000);
    const offset = opts.offset ?? 0;

    const qb = this.scores
      .createQueryBuilder('s')
      .innerJoin(Company, 'c', 'c.id = s.company_id')
      .where('s.asOfDate = (SELECT MAX("asOfDate") FROM iqs_scores)')
      .select([
        's.id as id',
        's.company_id as "companyId"',
        'c.ticker as ticker',
        'c.name as name',
        'c.sector as sector',
        'c.industry as industry',
        'c."marketCap" as "marketCap"',
        'c."lastPrice" as "lastPrice"',
        'c.exchange as exchange',
        's.iqs as iqs',
        's."insiderWeight" as "insiderWeight"',
        's."transactionWeight" as "transactionWeight"',
        's."convictionWeight" as "convictionWeight"',
        's."historicalSuccessWeight" as "historicalSuccessWeight"',
        's."clusterWeight" as "clusterWeight"',
        's."marketTimingWeight" as "marketTimingWeight"',
        's."distinctBuyers" as "distinctBuyers"',
        's."transactionCount" as "transactionCount"',
        's."totalPurchaseValue" as "totalPurchaseValue"',
        's.reasoning as reasoning',
        's."pedigreeScore" as "pedigreeScore"',
        's."litigationDeduction" as "litigationDeduction"',
        's."subInsiderOwnership" as "subInsiderOwnership"',
        's."subBuySellBalance" as "subBuySellBalance"',
        's."buyingScore" as "buyingScore"',
        's."sectorSentiment" as "sectorSentiment"',
        's."mdaSentiment" as "mdaSentiment"',
        's."momentumScore" as "momentumScore"',
        's."dilutionScore" as "dilutionScore"',
        's."dataCompleteness" as "dataCompleteness"',
        's."subVolumeVsMcap" as "subVolumeVsMcap"',
        's."subCluster" as "subCluster"',
        's."subRole" as "subRole"',
        's."subHoldingChange" as "subHoldingChange"',
        's."subPriceVsBuys" as "subPriceVsBuys"',
        's."subOwnershipPct" as "subOwnershipPct"',
        's."updatedAt" as "scoreUpdatedAt"',
        's."insiderOwnershipPct" as "insiderOwnershipPct"',
        's."insiderOwnershipChangePct" as "insiderOwnershipChangePct"',
      ]);

    if (opts.sector) {
      qb.andWhere('LOWER(c.sector) LIKE LOWER(:sec)', { sec: `%${opts.sector}%` });
    }
    if (typeof opts.minMarketCap === 'number') {
      qb.andWhere('c."marketCap" >= :minMc', { minMc: opts.minMarketCap });
    }
    if (typeof opts.maxMarketCap === 'number') {
      qb.andWhere('c."marketCap" <= :maxMc', { maxMc: opts.maxMarketCap });
    }
    if (typeof opts.minIqs === 'number') {
      qb.andWhere('s.iqs >= :minIqs', { minIqs: opts.minIqs });
    }
    // Drop companies whose SEC mapping yielded no usable ticker — they can't be
    // clicked, quoted, or charted, so they shouldn't occupy a ranking slot.
    qb.andWhere("c.ticker IS NOT NULL AND UPPER(c.ticker) NOT IN ('NONE','N/A','')");
    // "Exchanges" filter: All (no filter) / US / CA / DE. Companies default to
    // 'US'; BaFin ingestion tags German issuers 'DE'. Ranking stays global —
    // a German stock scoring #1 shows #1 unless the user narrows the exchange.
    const exchange = normalizeExchange(opts.exchange);
    if (exchange) {
      qb.andWhere('c.exchange = :exchange', { exchange });
    }

    const countRow = await qb.clone().select('COUNT(*)', 'count').getRawOne<{ count: string }>();
    const total = Number(countRow?.count || 0);

    let raw = await qb.orderBy('s.iqs', 'DESC').limit(limit * 4).offset(offset).getRawMany();

    if (opts.sectorMatch) {
      const rx = opts.sectorMatch;
      // Match the broad sector OR the finer industry — non-US listings often
      // only have a coarse sector ("Basic Materials") whose specific industry
      // ("Gold") is what the keyword rule actually targets.
      raw = raw.filter(
        (r) =>
          (r.sector && rx.test(String(r.sector))) ||
          (r.industry && rx.test(String(r.industry))),
      );
    }
    raw = raw.slice(0, limit);

    const rows: RankingRow[] = raw.map((r: any, i: number) => ({
      rank: offset + i + 1,
      companyId: r.companyId,
      ticker: r.ticker,
      name: r.name,
      sector: r.sector,
      // Sanity-checked: a cap smaller than the insider buying it supposedly
      // contains is bad reference data — show "—" rather than nonsense.
      marketCap: sanitizedMarketCap(r.marketCap, Number(r.totalPurchaseValue) || 0),
      lastPrice: r.lastPrice !== null ? Number(r.lastPrice) : null,
      exchange: r.exchange ?? null,
      iqs: Number(r.iqs),
      insiderWeight: Number(r.insiderWeight),
      transactionWeight: Number(r.transactionWeight),
      convictionWeight: Number(r.convictionWeight),
      historicalSuccessWeight: Number(r.historicalSuccessWeight),
      clusterWeight: Number(r.clusterWeight),
      marketTimingWeight: Number(r.marketTimingWeight),
      distinctBuyers: Number(r.distinctBuyers),
      transactionCount: Number(r.transactionCount),
      totalPurchaseValue: Number(r.totalPurchaseValue),
      reasoning: r.reasoning ?? null,
      pedigreeScore: r.pedigreeScore != null ? Number(r.pedigreeScore) : null,
      litigationDeduction: r.litigationDeduction != null ? Number(r.litigationDeduction) : null,
      subInsiderOwnership: r.subInsiderOwnership != null ? Number(r.subInsiderOwnership) : null,
      subBuySellBalance: r.subBuySellBalance != null ? Number(r.subBuySellBalance) : null,
      // IQ v2 component breakdown (null-safe — older rows may lack them).
      buyingScore: r.buyingScore != null ? Number(r.buyingScore) : null,
      sectorSentiment: r.sectorSentiment != null ? Number(r.sectorSentiment) : null,
      mdaSentiment: r.mdaSentiment != null ? Number(r.mdaSentiment) : null,
      momentumScore: r.momentumScore != null ? Number(r.momentumScore) : null,
      dilutionScore: r.dilutionScore != null ? Number(r.dilutionScore) : null,
      dataCompleteness: r.dataCompleteness != null ? Number(r.dataCompleteness) : null,
      subVolumeVsMcap: r.subVolumeVsMcap != null ? Number(r.subVolumeVsMcap) : null,
      subCluster: r.subCluster != null ? Number(r.subCluster) : null,
      subRole: r.subRole != null ? Number(r.subRole) : null,
      subHoldingChange: r.subHoldingChange != null ? Number(r.subHoldingChange) : null,
      subPriceVsBuys: r.subPriceVsBuys != null ? Number(r.subPriceVsBuys) : null,
      subOwnershipPct: r.subOwnershipPct != null ? Number(r.subOwnershipPct) : null,
      scoreUpdatedAt: r.scoreUpdatedAt ? new Date(r.scoreUpdatedAt).toISOString() : null,
      insiderOwnershipPct: r.insiderOwnershipPct != null ? Number(r.insiderOwnershipPct) : null,
      insiderOwnershipChangePct:
        r.insiderOwnershipChangePct != null ? Number(r.insiderOwnershipChangePct) : null,
    }));

    // Average insider cost + last buy date per company — computed from the
    // Form 4 open-market buys (one grouped query for the whole page).
    if (rows.length) {
      const ids = rows.map((r) => r.companyId);
      const since90 = new Date(Date.now() - WINDOWS.buys * 86400 * 1000);
      const aggs = await this.txRepo
        .createQueryBuilder('t')
        .select('t.company_id', 'companyId')
        .addSelect('SUM(t."sharesBought" * t."pricePerShare")', 'val')
        .addSelect('SUM(t."sharesBought")', 'sh')
        .addSelect('MAX(t."transactionDate")', 'lastBuy')
        .where('t.company_id IN (:...ids)', { ids })
        .andWhere(`t."transactionCode" = 'P'`)
        .andWhere('t."transactionDate" >= :since90', { since90 })
        .andWhere(plausibleTxSql('t'))
        .groupBy('t.company_id')
        .getRawMany();
      const aggMap = new Map(aggs.map((a: any) => [a.companyId, a]));
      for (const r of rows) {
        const a = aggMap.get(r.companyId);
        const sh = a ? Number(a.sh) || 0 : 0;
        r.avgCost = a && sh > 0 ? +(Number(a.val) / sh).toFixed(2) : null;
        r.lastBuyDate = a?.lastBuy
          ? new Date(a.lastBuy).toISOString().slice(0, 10)
          : null;
        // Stock performance since insiders' 90-day average cost.
        r.perfVsAvgCostPct =
          r.avgCost && r.avgCost > 0 && r.lastPrice && r.lastPrice > 0
            ? +(((r.lastPrice - r.avgCost) / r.avgCost) * 100).toFixed(2)
            : null;
      }

      // Insider-type category flags — which roles / filer types bought each
      // company (open-market 'P' only). Powers the "Cluster / CEO / CFO /
      // Hedge Funds" preset filter on the rankings table. Cluster is derived
      // client-side from distinctBuyers ≥ 2.
      const since90r = new Date(Date.now() - WINDOWS.buys * 86400 * 1000);
      const roleRows = await this.txRepo
        .createQueryBuilder('t')
        .select('t.company_id', 'companyId')
        .addSelect('t.role', 'role')
        .addSelect('t."insiderName"', 'insiderName')
        .where('t.company_id IN (:...ids)', { ids })
        .andWhere(`t."transactionCode" = 'P'`)
        .andWhere('t."transactionDate" >= :since90r', { since90r })
        .getRawMany();
      const catByCompany = new Map<
        string,
        { ceo: boolean; cfo: boolean; fund: boolean; buysByInsider: Map<string, number> }
      >();
      // Entity-style names (funds / institutional 10% owners) vs. individuals.
      const FUND_RE =
        /\b(L\.?P\.?|L\.?L\.?C\.?|Capital|Partners?|Management|Advisor|Adviser|Fund|Holdings?|Ventures?|Asset|Investments?|Group|Trust|Securities)\b/i;
      for (const rr of roleRows) {
        const cur =
          catByCompany.get(rr.companyId) || {
            ceo: false, cfo: false, fund: false, buysByInsider: new Map<string, number>(),
          };
        if (rr.role === 'CEO') cur.ceo = true;
        if (rr.role === 'CFO') cur.cfo = true;
        if (FUND_RE.test(String(rr.insiderName || ''))) cur.fund = true;
        const nm = String(rr.insiderName || '').toLowerCase();
        cur.buysByInsider.set(nm, (cur.buysByInsider.get(nm) || 0) + 1);
        catByCompany.set(rr.companyId, cur);
      }
      for (const r of rows) {
        const c = catByCompany.get(r.companyId);
        r.hasCeoBuyer = !!c?.ceo;
        r.hasCfoBuyer = !!c?.cfo;
        r.hasFundBuyer = !!c?.fund;
        // Repeat buyer: any single insider filed >1 open-market buy in 90 days.
        r.hasRepeatBuyer = c
          ? Array.from(c.buysByInsider.values()).some((n) => n >= 2)
          : false;
      }
    }

    // Merge real intraday change % from the live quote feed on request —
    // powers the sector-performance heatmap with actual market moves.
    if (opts.withLive && rows.length) {
      try {
        const quotes = await this.marketStats.getQuoteBatch(
          rows.map((r) => r.ticker || '').filter(Boolean),
        );
        for (const row of rows) {
          const q = row.ticker ? quotes.get(row.ticker.toUpperCase()) : null;
          row.changePct = q ? q.changePct : null;
          row.livePrice = q ? q.price : null;
        }
      } catch {
        /* quotes unavailable — rows ship without live fields */
      }
    }

    const result = { total, rows };
    this.rankCache.set(cacheKey, { ts: Date.now(), data: result });
    // Bound the cache — only a handful of distinct query shapes are ever hot.
    if (this.rankCache.size > 64) {
      const oldest = [...this.rankCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) this.rankCache.delete(oldest[0]);
    }
    return result;
  }

  async getCompanyDetail(ticker: string) {
    const company = await this.companies
      .createQueryBuilder('c')
      .where('LOWER(c.ticker) = :t', { t: ticker.toLowerCase() })
      .getOne();
    // Not in our insider DB (e.g. a top-gainer/loser or any ticker the user
    // clicks): fall back to a live market quote so the page always has data
    // rather than showing "Company not found".
    if (!company) return this.getQuoteOnlyDetail(ticker);

    const scoreRow = await this.scores
      .createQueryBuilder('s')
      .where('s.company_id = :id', { id: company.id })
      .orderBy('s."asOfDate"', 'DESC')
      .getOne();

    const score = scoreRow
      ? {
          ...scoreRow,
          insiderWeight: Number(scoreRow.insiderWeight),
          transactionWeight: Number(scoreRow.transactionWeight),
          convictionWeight: Number(scoreRow.convictionWeight),
          historicalSuccessWeight: Number(scoreRow.historicalSuccessWeight),
          clusterWeight: Number(scoreRow.clusterWeight),
          marketTimingWeight: Number(scoreRow.marketTimingWeight),
          iqs: Number(scoreRow.iqs),
          totalPurchaseValue: Number(scoreRow.totalPurchaseValue),
        }
      : null;

    // IQS trend over time — one point per scoring run.
    const historyRows = await this.scores
      .createQueryBuilder('s')
      .where('s.company_id = :id', { id: company.id })
      .orderBy('s."asOfDate"', 'ASC')
      .getMany();
    const scoreHistory = historyRows.map((s) => ({
      asOfDate: s.asOfDate,
      iqs: Number(s.iqs),
    }));

    const txRows = await this.txRepo
      .createQueryBuilder('t')
      .where('t.company_id = :id', { id: company.id })
      .orderBy('t.transactionDate', 'DESC')
      .limit(200)
      .getMany();

    const capForSanity = company.marketCap != null ? Number(company.marketCap) : 0;
    const lastPriceForSanity = company.lastPrice != null ? Number(company.lastPrice) : null;
    let transactions: any[] = txRows.map((t) => ({
      ...t,
      type: t.transactionCode === 'S' ? 'SELL' : 'BUY',
      sharesBought: Number(t.sharesBought),
      pricePerShare: Number(t.pricePerShare),
      totalValue: Number(t.totalValue),
      // Same plausibility flag the trades feed uses, so the profile page's
      // meter/summary/table all exclude the same filer-error dollar figures.
      priceSuspect:
        !isPlausibleTx(Number(t.sharesBought), Number(t.pricePerShare), lastPriceForSanity) ||
        (capForSanity > 0 && Number(t.totalValue) > capForSanity),
      previousHoldings: t.previousHoldings === null ? null : Number(t.previousHoldings),
      postHoldings: t.postHoldings === null ? null : Number(t.postHoldings),
    }));
    // No stored Form 4s for this company → pull live from SEC EDGAR so the page
    // still shows real insider activity (buys + sells).
    if (transactions.length === 0 && company.ticker) {
      transactions = await this.getLiveInsiderTx(company.ticker);
    }

    // Sanity-check the cap against observed open-market buying (see
    // sanitizedMarketCap) so the profile never shows an impossible value.
    const buysTotal = transactions
      .filter((t: any) => t.transactionCode === 'P')
      .reduce((a: number, t: any) => {
        const v = Number(t.totalValue) || 0;
        return v > 0 && v <= MAX_PLAUSIBLE_TX_VALUE ? a + v : a;
      }, 0);
    const companyOut = {
      ...company,
      lastPrice: company.lastPrice === null ? null : Number(company.lastPrice),
      marketCap:
        company.marketCap === null
          ? null
          : sanitizedMarketCap(Number(company.marketCap), buysTotal),
    };

    let congressionalTrades: any[] = [];
    if (company.ticker) {
      try {
        congressionalTrades = await this.congress.byTicker(company.ticker);
      } catch {
        congressionalTrades = [];
      }
    }

    return { company: companyOut, score, scoreHistory, transactions, congressionalTrades };
  }

  /** Build a company-detail payload from a live market quote for a ticker we
   *  don't have insider data for. Score/transactions are empty, but the page
   *  renders with a real name, price, market cap and sector — and still shows
   *  any congressional trades we have for the ticker. */
  private async getQuoteOnlyDetail(ticker: string) {
    const sym = ticker.toUpperCase();
    let quote: any = null;
    try {
      const batch = await this.marketStats.getQuoteBatch([sym]);
      quote = batch.get(sym) || null;
    } catch {
      quote = null;
    }

    const company = {
      id: `quote:${sym}`,
      cik: '',
      ticker: sym,
      name: quote?.name || sym,
      sector: quote?.sector ?? null,
      marketCap: quote?.marketCap ?? null,
      lastPrice: quote?.price ?? null,
    };

    let congressionalTrades: any[] = [];
    try {
      congressionalTrades = await this.congress.byTicker(sym);
    } catch {
      congressionalTrades = [];
    }

    // Live SEC Form 4 activity so the page isn't empty for tickers we haven't
    // ingested (e.g. mega-caps the user clicks into).
    const transactions = await this.getLiveInsiderTx(sym);

    return {
      company,
      score: null,
      scoreHistory: [],
      transactions,
      congressionalTrades,
      quoteOnly: true,
    };
  }

  /**
   * Full step-by-step IQ Score calculation trace for one ticker — powers the
   * client-facing "score explainer" page. Runs EXACTLY the same math as
   * recalculateAll (same guards, same scoring functions, same weights) but
   * returns every intermediate value with its data source instead of
   * persisting a row. Temporary demo feature — safe to remove wholesale.
   */
  async explainScore(tickerRaw: string) {
    const ticker = (tickerRaw || '').trim().toUpperCase();
    if (!ticker) return null;
    const company = await this.companies
      .createQueryBuilder('c')
      .where('UPPER(c.ticker) = :t', { t: ticker })
      .getOne();

    const windowDays = WINDOWS.buys;
    const since = new Date(Date.now() - windowDays * 86400000);

    // Market quote up front — price/cap for the math, and name/sector when
    // the ticker isn't in our DB at all.
    let liveQ: any = null;
    try {
      const batch = await this.marketStats.getQuoteBatch([ticker]);
      liveQ = batch.get(ticker) || null;
    } catch {
      liveQ = null;
    }

    // Step 1 — raw Form 4 window (buys AND sells; sells feed the guard).
    // Stored filings when we have them; otherwise fetch LIVE from SEC EDGAR
    // so ANY searched ticker gets a real calculation, not "not found".
    let dataSource: 'database' | 'live SEC EDGAR' = 'database';
    let allTxs: Array<{
      insiderName: string;
      insiderCik?: string | null;
      role: InsiderTransaction['role'];
      transactionCode: string;
      transactionDate: any;
      sharesBought: number;
      pricePerShare: number;
      previousHoldings: number | null;
      postHoldings?: number | null;
    }> = [];
    if (company) {
      allTxs = await this.txRepo
        .createQueryBuilder('t')
        .where('t.company_id = :id', { id: company.id })
        .andWhere('t.transactionDate >= :since', { since })
        .andWhere(`t."transactionCode" IN ('P','S')`)
        .orderBy('t.transactionDate', 'DESC')
        .getMany();
    }
    if (!allTxs.length) {
      dataSource = 'live SEC EDGAR';
      try {
        const raw = await this.sec.getRecentForm4ByTicker(ticker, 40);
        allTxs = raw
          .filter((t) => t.transactionCode === 'P' || t.transactionCode === 'S')
          .filter((t) => new Date(t.transactionDate) >= since)
          .map((t) => {
            // Same previous-holdings derivation the ingester uses.
            const disposed = t.acquiredDisposed === 'D';
            const prev = disposed
              ? t.postHoldings + t.sharesBought
              : Math.max(0, t.postHoldings - t.sharesBought);
            return {
              insiderName: t.insiderName,
              insiderCik: t.reportingOwnerCik ?? null,
              role: normalizeRole(t.rawTitle, t.isDirector, t.isOfficer),
              transactionCode: t.transactionCode,
              transactionDate: t.transactionDate,
              sharesBought: t.sharesBought,
              pricePerShare: t.pricePerShare,
              previousHoldings: prev,
              postHoldings: t.postHoldings ?? null,
            };
          })
          .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)));
      } catch {
        allTxs = [];
      }
    }

    // Truly unknown ticker: no DB row, no quote, no live filings.
    if (!company && !liveQ && !allTxs.length) return { found: false, ticker };

    // Company metadata — DB row when present, live quote otherwise. MD&A and
    // dilution are precomputed DB fields, so live-only names fall to neutral.
    const meta = {
      name: company?.name || liveQ?.name || ticker,
      sector: company?.sector ?? liveQ?.sector ?? null,
      industry: company?.industry ?? null,
      mdaSentiment: company?.mdaSentiment ?? null,
      dilutionPctTtm: company?.dilutionPctTtm ?? null,
    };

    // Step 2 — round-trip guard.
    const sharesBySide = new Map<string, { buy: number; sell: number }>();
    for (const t of allTxs) {
      const key = t.insiderName.toLowerCase();
      const e = sharesBySide.get(key) || { buy: 0, sell: 0 };
      const sh = Number(t.sharesBought) || 0;
      if (t.transactionCode === 'P') e.buy += sh;
      else e.sell += sh;
      sharesBySide.set(key, e);
    }
    const isRoundTripper = (insider: string): boolean => {
      const e = sharesBySide.get(insider.toLowerCase());
      if (!e || e.buy <= 0) return false;
      return e.sell >= e.buy * 0.5;
    };

    // Step 3 — market data (live quote fetched above; SEC-derived fallback
    // only exists for companies in our DB).
    const secPrice = company?.lastPrice ? Number(company.lastPrice) : 0;
    const secMarketCap = company?.marketCap ? Number(company.marketCap) : 0;
    const lastPrice = liveQ?.price && liveQ.price > 0 ? liveQ.price : secPrice;
    const marketCap =
      liveQ?.marketCap && liveQ.marketCap > 0 ? liveQ.marketCap : secMarketCap;

    // Step 4 — per-transaction classification (kept / excluded and why).
    const txTrace = allTxs.map((t) => {
      const shares = Number(t.sharesBought);
      const price = Number(t.pricePerShare);
      const value = shares * price;
      let status: 'counted' | 'excluded' = 'counted';
      let reason: string | null = null;
      if (t.transactionCode !== 'P') {
        status = 'excluded';
        reason = 'Sell (code S) — not counted as buying, but feeds the Buy/Sell Balance sub-factor';
      } else if (isRoundTripper(t.insiderName)) {
        status = 'excluded';
        reason = 'Round-trip guard — this insider sold back ≥50% of their buys in the window';
      } else if (!Number.isFinite(value) || value <= 0 || value > MAX_PLAUSIBLE_TX_VALUE) {
        status = 'excluded';
        reason = 'Parse-artifact guard — implausible transaction value (> $1B or ≤ 0)';
      } else if (lastPrice > 0 && price > lastPrice * 25) {
        status = 'excluded';
        reason = `Price-sanity guard — filed at $${price.toLocaleString('en-US')}/share vs ~$${lastPrice.toFixed(2)} market price (25×+): parse/conversion artifact, not an open-market buy`;
      }
      return {
        insiderName: t.insiderName,
        role: t.role,
        roleMultiplier: ROLE_MULTIPLIER[t.role] ?? ROLE_MULTIPLIER.Other,
        code: t.transactionCode,
        date: t.transactionDate,
        shares,
        price,
        value: +value.toFixed(2),
        previousHoldings: t.previousHoldings === null ? null : Number(t.previousHoldings),
        plannedBuy: (t as any).plannedBuy === true,
        status,
        reason,
      };
    });

    // Step 5 — aggregates over the counted buys (same loop as the scorer).
    const counted = txTrace.filter((t) => t.status === 'counted');
    let totalPurchaseValue = 0;
    let signalValue = 0; // plan-discounted dollars (sub-factor A input)
    let totalShares = 0;
    let roleWeightedValue = 0;
    const buyers = new Set<string>();
    const holdingChangePcts: number[] = [];
    let ownWeightedSum = 0;
    let ownWeightSum = 0;
    for (const t of counted) {
      const planMult = t.plannedBuy ? PLANNED_BUY_MULTIPLIER : 1;
      totalPurchaseValue += t.value;
      signalValue += t.value * planMult;
      totalShares += t.shares;
      roleWeightedValue += t.value * t.roleMultiplier * planMult;
      buyers.add(t.insiderName.toLowerCase());
      const prev = t.previousHoldings || 0;
      if (prev > 0) {
        const frac = t.shares / prev;
        holdingChangePcts.push(frac * 100);
        ownWeightedSum += Math.min(frac, NORM.ownershipPctCap) * t.roleMultiplier;
        ownWeightSum += t.roleMultiplier;
      } else {
        // First-time buyer — maximal commitment in BOTH stake metrics so D
        // and F never contradict each other on the same filer.
        if (t.previousHoldings != null && t.shares > 0) holdingChangePcts.push(100);
        ownWeightedSum += NORM.ownershipPctCap * t.roleMultiplier;
        ownWeightSum += t.roleMultiplier;
      }
    }
    const safeCap = sanitizedMarketCap(marketCap, totalPurchaseValue) ?? 0;
    const insiderVwap = totalShares > 0 ? totalPurchaseValue / totalShares : null;
    const avgHoldingChangePct = holdingChangePcts.length
      ? holdingChangePcts.reduce((a, b) => a + b, 0) / holdingChangePcts.length
      : null;
    // Insider selling dollars in the window (same parse guard as buys) —
    // feeds the Buy/Sell Balance sub-factor.
    const totalSellValue = txTrace
      .filter((t) => t.code === 'S')
      .reduce((a, t) => (t.value > 0 && t.value <= MAX_PLAUSIBLE_TX_VALUE ? a + t.value : a), 0);

    // Step 6 — the v2.1 Buying sub-factors A–G.
    const volumeRatio = safeCap > 0 ? signalValue / safeCap : null;
    const roleRatio = safeCap > 0 ? roleWeightedValue / safeCap : null;
    const ownAvg = ownWeightSum > 0 ? ownWeightedSum / ownWeightSum : null;
    const subVolume = scoreVolumeVsMarketCap(volumeRatio);
    const subCluster = counted.length ? scoreCluster(buyers.size) : null;
    const subRole = scoreRole(roleRatio);
    const subHolding = scoreHoldingChange(avgHoldingChangePct);
    const subPriceVsBuys = scorePriceVsBuys(insiderVwap, lastPrice > 0 ? lastPrice : null);
    const subStake = scoreStakeIncrease(ownAvg);
    // G — aggregate insider ownership: latest post-transaction holdings per
    // individual filer (CIK-deduped, §6.3.1) over REAL shares outstanding
    // (SEC XBRL) with the market-cap ÷ price proxy as the fallback.
    const latestHolding = new Map<string, { date: string; shares: number }>();
    for (const t of allTxs) {
      if (IqsService.FUND_NAME.test(t.insiderName)) continue;
      const post = Number(t.postHoldings);
      if (!Number.isFinite(post) || post < 0) continue;
      const key = t.insiderCik || t.insiderName.trim().toLowerCase();
      const d = String(t.transactionDate);
      const cur = latestHolding.get(key);
      if (!cur || d > cur.date) latestHolding.set(key, { date: d, shares: post });
    }
    const insiderShares = [...latestHolding.values()].reduce((a, b) => a + b.shares, 0);
    const realSharesOut = Number(company?.sharesOutstanding) || 0;
    const sharesOut =
      realSharesOut > 0
        ? realSharesOut
        : lastPrice > 0 && marketCap > 0
          ? marketCap / lastPrice
          : 0;
    // null only when holdings DATA is missing; a measured ~0% scores 0.
    // Fractions near/above 100% are denominator mismatches (see recalc) →
    // treated as unknown, never asserted as "insiders hold 100%".
    const rawOwnFraction =
      latestHolding.size > 0 && sharesOut > 0 ? insiderShares / sharesOut : null;
    const ownershipFraction =
      rawOwnFraction != null && rawOwnFraction <= 0.98 ? rawOwnFraction : null;
    const subOwnershipG = scoreInsiderOwnership(ownershipFraction);
    const subBalance = scoreBuySellBalance(totalPurchaseValue, totalSellValue);
    const buyingScore = computeBuyingScore({
      volumeVsMarketCap: subVolume,
      cluster: subCluster,
      role: subRole,
      holdingChange: subHolding,
      priceVsBuys: subPriceVsBuys,
      stakeIncrease: subStake,
      insiderOwnership: subOwnershipG,
      buySellBalance: subBalance,
    });

    // Step 7 — the other components, each with its source.
    const sectorScore = await this.sectorSentiment
      .getScoreFor(meta.sector, meta.industry)
      .catch(() => null);
    const mdaScore = meta.mdaSentiment != null ? Number(meta.mdaSentiment) : null;
    const shortVol = Number(liveQ?.avgVol10d ?? 0);
    const longVol = Number(liveQ?.avgVolume ?? 0);
    const relVol = shortVol > 0 && longVol > 0 ? shortVol / longVol : null;
    const recentDollarVol = lastPrice > 0 && shortVol > 0 ? lastPrice * shortVol : null;
    const momentumScore = scoreMomentum(relVol, recentDollarVol);
    const dilutionPct = meta.dilutionPctTtm != null ? Number(meta.dilutionPctTtm) : null;
    const dilutionScore = scoreDilution(dilutionPct);

    // Pedigree (v2.1 §6) + litigation (§7) — ANALYST-CONFIRMED profiles only
    // (review gate §6.3.4), resolved by reporting-person CIK first (§6.3.1),
    // name as legacy fallback.
    const pedigreeInputs: PedigreeInsiderInput[] = [];
    const litigationMatters: Array<LitigationMatterInput & { caption?: string; source?: string }> = [];
    const pedigreeHighlights: Array<{ name: string; flags: string[] }> = [];
    const roleByFiler = new Map<string, { roleMult: number; name: string; cik: string | null }>();
    for (const t of allTxs) {
      const key = t.insiderName.trim().toLowerCase();
      if (!roleByFiler.has(key)) {
        roleByFiler.set(key, {
          roleMult: ROLE_MULTIPLIER[t.role] ?? ROLE_MULTIPLIER.Other,
          name: t.insiderName,
          cik: t.insiderCik || null,
        });
      }
    }
    try {
      const filers = [...roleByFiler.keys()];
      const ciks = [...roleByFiler.values()].map((i) => i.cik).filter(Boolean) as string[];
      const profs = filers.length
        ? await this.profiles
            .createQueryBuilder('p')
            .where(
              ciks.length
                ? '(p."nameKey" IN (:...filers) OR p.cik IN (:...ciks))'
                : 'p."nameKey" IN (:...filers)',
              { filers, ciks },
            )
            .andWhere('p.suppressed = false')
            .andWhere('p."reviewedBy" IS NOT NULL')
            .getMany()
        : [];
      for (const p of profs) {
        const info =
          roleByFiler.get(p.nameKey) ??
          (p.cik ? [...roleByFiler.values()].find((i) => i.cik === p.cik) : undefined);
        if (!info) continue;
        const flags: string[] = JSON.parse(p.flags || '[]');
        pedigreeInputs.push({
          flags,
          roleMultiplier: info.roleMult,
          recentBuyer: buyers.has(p.nameKey),
        });
        if (flags.length) pedigreeHighlights.push({ name: info.name, flags });
        litigationMatters.push(...JSON.parse(p.litigationMatters || '[]'));
      }
    } catch {
      /* profiles unavailable → baseline */
    }
    const pedigreeScore = computePedigreeScore(pedigreeInputs, PEDIGREE_FLAG_POINTS);
    const litigationDeduction = computeLitigationDeduction(litigationMatters);

    // Step 8 — the weighted composite, then the litigation deduction.
    // §12 dark mode: people-signals computed but not applied until
    // IQS_PEOPLE_SIGNALS_LIVE=true.
    const composite = assembleComposite(
      {
        buying: buyingScore,
        sector: sectorScore,
        mda: mdaScore,
        momentum: momentumScore,
        pedigree: PEOPLE_SIGNALS_LIVE ? pedigreeScore : null,
        dilution: dilutionScore,
      },
      PEOPLE_SIGNALS_LIVE ? litigationDeduction : 0,
    );

    // Old v1 score (insider-only) — same math the scorer stores as iqsV1.
    const vA = safeCap > 0 ? totalPurchaseValue / safeCap : 0;
    const vB = Math.log(1 + buyers.size);
    const vC = safeCap > 0 ? roleWeightedValue / safeCap : 0;
    const vD = avgHoldingChangePct ?? 0;
    const v1Sum = vA + vB + vC + vD;
    const v1Log = Math.log(1 + v1Sum);
    const iqsV1 = counted.length
      ? +Math.min(99, (v1Log / 6.5) * 100).toFixed(1)
      : null;

    return {
      found: true,
      ticker,
      comparison: {
        old: {
          label: 'Old Insider Score (v1)',
          score: iqsV1,
          formula: 'log(1 + A + B + C + D) ÷ 6.5 × 100, capped at 99',
          includes: [
            'A — Purchase volume ÷ market cap',
            'B — Cluster: log(1 + distinct buyers)',
            'C — Role-weighted volume ÷ market cap',
            'D — Avg holding-change % per buyer',
          ],
          note: 'Measures the insider buying alone — no market or fundamental context.',
          // Full v1 working — every factor's input and value, then the math.
          factors: [
            {
              key: 'A', name: 'Purchase volume ÷ market cap',
              inputLabel: `$${Math.round(totalPurchaseValue).toLocaleString('en-US')} ÷ ${safeCap ? '$' + Math.round(safeCap).toLocaleString('en-US') : '—'}`,
              value: +vA.toFixed(6),
            },
            {
              key: 'B', name: 'Cluster — log(1 + distinct buyers)',
              inputLabel: `${buyers.size} distinct buyer${buyers.size === 1 ? '' : 's'}`,
              value: +vB.toFixed(4),
            },
            {
              key: 'C', name: 'Role-weighted volume ÷ market cap',
              inputLabel: `Σ($ × role mult) = $${Math.round(roleWeightedValue).toLocaleString('en-US')}`,
              value: +vC.toFixed(6),
            },
            {
              key: 'D', name: 'Avg holding-change % per buyer',
              inputLabel: avgHoldingChangePct != null ? `${avgHoldingChangePct.toFixed(2)}% avg stake added` : 'no holdings data → 0',
              value: +vD.toFixed(4),
            },
          ],
          math: {
            sum: +v1Sum.toFixed(4),
            log: +v1Log.toFixed(4),
            scaled: +((v1Log / 6.5) * 100).toFixed(2),
            final: iqsV1,
            steps: [
              `A + B + C + D = ${v1Sum.toFixed(4)}`,
              `log(1 + ${v1Sum.toFixed(4)}) = ${v1Log.toFixed(4)}`,
              `${v1Log.toFixed(4)} ÷ 6.5 × 100 = ${((v1Log / 6.5) * 100).toFixed(2)}`,
              `capped at 99 → ${iqsV1 ?? '—'}`,
            ],
          },
        },
        new: {
          label: 'New Insider Score (v2.1 composite)',
          score: composite.score,
          formula:
            'max(0, 0.45·Buying + 0.22·Sector + 0.10·MD&A + 0.10·Momentum + 0.08·Pedigree + 0.05·Dilution − Litigation)',
          includes: [
            'Insider buying (sub-factors A–G) — 45%',
            'Sector sentiment (sector-ETF signal) — 22%',
            'MD&A filing tone (AI-scored) — 10%',
            'Volume momentum (10d vs 3m) — 10%',
            'Insider pedigree (track record, wealth, connections) — 8%',
            'Share dilution (TTM growth) — 5%',
            'Litigation screening — deduction up to 15 points',
          ],
          note: 'The buying signal plus the market, fundamental and people context around it.',
        },
      },
      company: {
        name: meta.name,
        sector: meta.sector,
        industry: meta.industry,
      },
      /** Where the Form 4 filings came from — our ingested DB, or fetched
       *  live from SEC EDGAR for tickers outside our stored universe. */
      filingsSource: dataSource,
      config: {
        windowDays,
        componentWeights: COMPONENT_WEIGHTS,
        roleMultipliers: ROLE_MULTIPLIER,
        neutral: NEUTRAL,
        ceiling: SCORE_CEILING,
      },
      marketData: {
        source: liveQ?.price > 0 ? 'Live Yahoo Finance quote' : 'SEC-derived fallback',
        lastPrice: lastPrice || null,
        marketCap: marketCap || null,
        marketCapUsed: safeCap || null,
        capSanityNote:
          safeCap === 0 && marketCap > 0
            ? 'Market cap smaller than observed insider buying — treated as unknown'
            : null,
        avgVol10d: shortVol || null,
        avgVol3m: longVol || null,
      },
      transactions: txTrace,
      aggregates: {
        countedBuys: counted.length,
        excluded: txTrace.length - counted.length,
        totalPurchaseValue: +totalPurchaseValue.toFixed(2),
        totalSellValue: +totalSellValue.toFixed(2),
        totalShares,
        distinctBuyers: buyers.size,
        insiderVwap: insiderVwap != null ? +insiderVwap.toFixed(4) : null,
        avgHoldingChangePct:
          avgHoldingChangePct != null ? +avgHoldingChangePct.toFixed(2) : null,
      },
      buying: {
        subFactors: [
          {
            key: 'A', name: 'Purchase size vs market cap', weight: BUYING_SUBWEIGHTS.volumeVsMarketCap,
            input: volumeRatio, inputLabel: 'total $ bought ÷ market cap',
            formula: 'ln(1 + ratio ÷ 0.02) ÷ ln(5) × 100 — ~2% of cap ≈ strong',
            score: subVolume,
          },
          {
            key: 'B', name: 'Cluster (distinct buyers)', weight: BUYING_SUBWEIGHTS.cluster,
            input: buyers.size, inputLabel: 'distinct insider buyers',
            formula: 'ln(1 + buyers) ÷ ln(7) × 100 — 6 buyers ≈ 100',
            score: subCluster,
          },
          {
            key: 'C', name: 'Role-weighted size vs cap', weight: BUYING_SUBWEIGHTS.role,
            input: roleRatio, inputLabel: 'Σ($ × role multiplier) ÷ market cap',
            formula: 'ln(1 + ratio ÷ 0.06) ÷ ln(5) × 100 — CEO/CFO/COO 1.0, Director 0.6, Other 0.4',
            score: subRole,
          },
          {
            key: 'D', name: 'Holding change', weight: BUYING_SUBWEIGHTS.holdingChange,
            input: avgHoldingChangePct, inputLabel: 'avg % each buyer added to their stake',
            formula: 'avg per-buyer % added, capped at 100% (absolute commitment)',
            score: subHolding,
          },
          {
            key: 'E', name: 'Cost basis vs price', weight: BUYING_SUBWEIGHTS.priceVsBuys,
            input: insiderVwap != null && lastPrice > 0 ? insiderVwap / lastPrice : null,
            inputLabel: 'insider avg cost ÷ current price',
            formula: 'clamp(ratio, 0.5–2.0) min-maxed to 0–100; >1 (stock below insider cost) = bullish',
            score: subPriceVsBuys,
          },
          {
            key: 'F', name: 'Ownership increase (per insider)', weight: BUYING_SUBWEIGHTS.stakeIncrease,
            input: ownAvg, inputLabel: 'role-weighted avg relative stake growth (0–1)',
            formula:
              'shares bought ÷ previous holdings per buyer, role-weighted, capped at doubling (1.0 → 100); first-time buyers get the cap',
            score: subStake,
          },
          {
            key: 'G', name: 'Aggregate insider ownership (NEW v2.1)', weight: BUYING_SUBWEIGHTS.insiderOwnership,
            input: ownershipFraction,
            inputLabel: `insiders hold ~${insiderShares.toLocaleString('en-US')} shares of ~${sharesOut > 0 ? Math.round(sharesOut).toLocaleString('en-US') : '—'} outstanding`,
            formula:
              'insider shares ÷ shares outstanding through the piecewise curve: <1%→0–10, 5%→40, 15%→75, 40%+→100, taper above 60% (controlled-company caveat)',
            score: subOwnershipG,
          },
          {
            key: 'S', name: 'Buy/Sell balance (informational)', weight: BUYING_SUBWEIGHTS.buySellBalance,
            input: totalPurchaseValue + totalSellValue > 0
              ? totalPurchaseValue / (totalPurchaseValue + totalSellValue)
              : null,
            inputLabel: `$${Math.round(totalPurchaseValue).toLocaleString('en-US')} bought vs $${Math.round(totalSellValue).toLocaleString('en-US')} sold`,
            formula:
              'buy$ ÷ (buy$ + sell$) × 100 — displayed for context; 0% weight pending the spec’s open question on sales',
            score: subBalance,
          },
        ],
        note: 'Sub-weights renormalize over whichever sub-factors have data.',
        buyingScore,
      },
      components: [
        {
          key: 'buying', name: 'Insider Buying', weight: COMPONENT_WEIGHTS.buying,
          source: 'SEC Form 4 open-market purchases (code P), last 90 days',
          score: buyingScore,
          usedNeutral: false,
        },
        {
          key: 'sector', name: 'Sector Sentiment', weight: COMPONENT_WEIGHTS.sector,
          source: `Daily sector-ETF sentiment for "${meta.sector || 'Unknown'}"`,
          score: sectorScore,
          usedNeutral: sectorScore == null,
        },
        {
          key: 'mda', name: 'MD&A Tone', weight: COMPONENT_WEIGHTS.mda,
          source: 'AI-scored tone of the company\'s own 10-K/10-Q MD&A language',
          score: mdaScore,
          usedNeutral: mdaScore == null,
        },
        {
          key: 'momentum', name: 'Volume Momentum', weight: COMPONENT_WEIGHTS.momentum,
          source: `10-day avg volume (${shortVol || '—'}) ÷ 3-month avg (${longVol || '—'}), Yahoo quote batch`,
          score: momentumScore,
          usedNeutral: momentumScore == null,
        },
        {
          key: 'pedigree', name: 'Insider Pedigree (NEW v2.1)', weight: COMPONENT_WEIGHTS.pedigree,
          source: pedigreeScore != null
            ? `Reviewed insider profiles: ${pedigreeHighlights
                .map((h) => `${h.name} (${h.flags.join(', ')})`)
                .join('; ')}${PEOPLE_SIGNALS_LIVE ? '' : ` — DARK MODE (§12): computed ${Math.round(pedigreeScore)} and logged, baseline ${PEDIGREE_BASELINE} applied to the score during the audit window`}`
            : `No reviewed pedigree profiles for these insiders yet — baseline ${PEDIGREE_BASELINE} applies (absence of fame ≠ negative signal)`,
          score: PEOPLE_SIGNALS_LIVE ? (pedigreeScore ?? PEDIGREE_BASELINE) : PEDIGREE_BASELINE,
          usedNeutral: !PEOPLE_SIGNALS_LIVE || pedigreeScore == null,
        },
        {
          key: 'dilution', name: 'Dilution', weight: COMPONENT_WEIGHTS.dilution,
          source: `TTM share growth${dilutionPct != null ? ` (${(dilutionPct * 100).toFixed(1)}%)` : ''} from SEC filings`,
          score: dilutionScore,
          usedNeutral: dilutionScore == null,
        },
      ],
      litigation: {
        deduction: PEOPLE_SIGNALS_LIVE ? +litigationDeduction.toFixed(2) : 0,
        computedDeduction: +litigationDeduction.toFixed(2),
        live: PEOPLE_SIGNALS_LIVE,
        cap: 15,
        matters: litigationMatters.map((m) => ({
          tier: m.tier,
          status: m.status,
          caption: m.caption ?? null,
          source: m.source ?? null,
        })),
        note: litigationMatters.length
          ? PEOPLE_SIGNALS_LIVE
            ? 'Deduction = tier points × status modifier × recency decay, capped at 15.'
            : `DARK MODE (§12): computed −${litigationDeduction.toFixed(2)} and logged; not applied to the score during the audit window.`
          : 'No confirmed litigation matters on file for these insiders — no deduction.',
      },
      final: {
        formula:
          'IQ = max(0, 0.45·Buying + 0.22·Sector + 0.10·MD&A + 0.10·Momentum + 0.08·Pedigree + 0.05·Dilution − Litigation)',
        missingRule: `A component with no data contributes neutral ${NEUTRAL} at its full weight (pedigree falls to its ${PEDIGREE_BASELINE} baseline)`,
        litigationDeduction: PEOPLE_SIGNALS_LIVE ? +litigationDeduction.toFixed(2) : 0,
        weightedSum: composite.score,
        dataCompleteness: composite.dataCompleteness,
        ceiling: SCORE_CEILING,
        score: composite.score,
        scoreNote:
          composite.score == null
            ? 'No qualifying insider buying in the last 90 days — this company gets no score'
            : null,
      },
    };
  }

  async getDashboard() {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const since30d = new Date(Date.now() - 30 * 86400 * 1000);

    const txRecent = await this.txRepo
      .createQueryBuilder('t')
      .where('t.transactionDate >= :since', { since: since30d })
      .andWhere(`t."transactionCode" = 'P'`)
      .leftJoinAndSelect('t.company', 'c')
      .orderBy('t.transactionDate', 'DESC')
      .getMany();

    const buys24h = txRecent.filter((t) => t.transactionDate >= since24h);
    const total24hValue = buys24h.reduce((a, t) => a + Number(t.totalValue), 0);
    const totalRecentValue = txRecent.reduce((a, t) => a + Number(t.totalValue), 0);
    const avg7dPerDay = txRecent.length > 0 ? txRecent.length / 7 : 0;
    const pct24hVs7d =
      avg7dPerDay > 0 ? ((buys24h.length - avg7dPerDay) / avg7dPerDay) * 100 : 0;

    const scores = await this.scores
      .createQueryBuilder('s')
      .where('s.asOfDate = (SELECT MAX("asOfDate") FROM iqs_scores)')
      .getMany();
    const avgIqs =
      scores.length > 0
        ? scores.reduce((a, s) => a + Number(s.iqs), 0) / scores.length
        : 0;
    const maxIqs = scores.length > 0 ? Math.max(...scores.map((s) => Number(s.iqs))) : 1;
    const confidence = maxIqs > 0 ? Math.min(10, (avgIqs / maxIqs) * 10) : 0;

    const sectorAgg = new Map<string, { value: number; count: number }>();
    for (const t of txRecent) {
      const sec = t.company?.sector || 'Other';
      const cur = sectorAgg.get(sec) || { value: 0, count: 0 };
      cur.value += Number(t.totalValue);
      cur.count += 1;
      sectorAgg.set(sec, cur);
    }
    const sectors = Array.from(sectorAgg.entries())
      .map(([name, v]) => ({ name, value: v.value, count: v.count }))
      .sort((a, b) => b.value - a.value);

    const topSector = sectors[0] || { name: '—', value: 0, count: 0 };

    const days: { date: string; count: number; value: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - i);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      const slice = txRecent.filter(
        (t) => new Date(t.transactionDate) >= day && new Date(t.transactionDate) < next,
      );
      days.push({
        date: day.toISOString().slice(0, 10),
        count: slice.length,
        value: slice.reduce((a, t) => a + Number(t.totalValue), 0),
      });
    }

    const topTrades = txRecent
      .slice()
      .sort((a, b) => Number(b.totalValue) - Number(a.totalValue))
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        insiderName: t.insiderName,
        role: t.role,
        rawTitle: t.rawTitle,
        ticker: t.company?.ticker || null,
        companyName: t.company?.name || '',
        sector: t.company?.sector || null,
        totalValue: Number(t.totalValue),
        sharesBought: Number(t.sharesBought),
        pricePerShare: Number(t.pricePerShare),
        transactionDate: t.transactionDate,
      }));

    return {
      metrics: {
        insiderBuys24h: buys24h.length,
        pct24hVs7d,
        totalRecentValue,
        confidence,
        topSector: { name: topSector.name, value: topSector.value },
      },
      sectors,
      activity: days,
      topTrades,
    };
  }

  async getAllTrades(opts: {
    limit?: number;
    offset?: number;
    q?: string;
    side?: 'buy' | 'sell' | 'all';
    month?: boolean;
    exchange?: string;
  }) {
    const limit = Math.min(opts.limit ?? 100, 2000);
    const offset = opts.offset ?? 0;
    const qb = this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.company', 'c')
      // Filings with implausible economics (e.g. a "$748,119/share" filer
      // error) are NOT hidden — they exist on EDGAR — but they are flagged
      // (priceSuspect) below so the UI shows "—" instead of a false $846M.
      .orderBy('t.transactionDate', 'DESC')
      .addOrderBy('t.totalValue', 'DESC');
    // "Exchanges" filter — narrow to a listing venue (US / CA / DE).
    const exchange = normalizeExchange(opts.exchange);
    if (exchange) qb.andWhere('c.exchange = :exchange', { exchange });
    if (opts.q) {
      qb.andWhere(
        '(LOWER(c.ticker) LIKE :q OR LOWER(c.name) LIKE :q OR LOWER(t.insiderName) LIKE :q)',
        { q: `%${opts.q.toLowerCase()}%` },
      );
    }
    // Buy/Sell side filter (P = open-market purchase, S = sale).
    if (opts.side === 'buy') qb.andWhere(`t."transactionCode" = 'P'`);
    else if (opts.side === 'sell') qb.andWhere(`t."transactionCode" = 'S'`);
    else if (opts.side === 'all')
      qb.andWhere(`t."transactionCode" IN ('P','S','A','M','X','F','C','G','J')`);
    // Current-month-only window (resets on the 1st, like the buy/sell meter).
    if (opts.month) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      qb.andWhere('t."transactionDate" >= :ms', { ms: monthStart.toISOString() });
    }
    const total = await qb.getCount();
    const rows = await qb.limit(limit).offset(offset).getMany();
    return {
      total,
      rows: (() => {
        const financingKeys = new Set<string>();
        const grp = new Map<string, Set<string>>();
        for (const t of rows) {
          if (t.transactionCode !== 'P') continue;
          const d = String(t.transactionDate).slice(0, 10);
          const key = `${t.companyId}|${d}|${Number(t.sharesBought)}|${Number(t.pricePerShare)}`;
          const set = grp.get(key) || new Set<string>();
          set.add((t.insiderName || '').toLowerCase());
          grp.set(key, set);
        }
        for (const [key, insiders] of grp) if (insiders.size >= 2) financingKeys.add(key);
        const classify = (t: InsiderTransaction): { txType: string; txLabel: string } => {
          const c = t.transactionCode;
          if (c === 'P') {
            const d = String(t.transactionDate).slice(0, 10);
            const key = `${t.companyId}|${d}|${Number(t.sharesBought)}|${Number(t.pricePerShare)}`;
            return financingKeys.has(key)
              ? { txType: 'financing', txLabel: 'Financing' }
              : { txType: 'open_market', txLabel: 'Open Market' };
          }
          if (c === 'S') return { txType: 'open_market', txLabel: 'Open Market' };
          if (c === 'A') return { txType: 'grant', txLabel: 'Grant / Award' };
          if (c === 'M' || c === 'X') return { txType: 'option', txLabel: 'Option Exercise' };
          if (c === 'F') return { txType: 'tax', txLabel: 'Tax Withholding' };
          if (c === 'G') return { txType: 'gift', txLabel: 'Gift' };
          if (c === 'C') return { txType: 'conversion', txLabel: 'Conversion' };
          return { txType: 'other', txLabel: 'Other' };
        };
        return rows.map((t) => {
        const capNum = t.company?.marketCap != null ? Number(t.company.marketCap) : 0;
        const suspect =
          !isPlausibleTx(
            Number(t.sharesBought),
            Number(t.pricePerShare),
            t.company?.lastPrice != null ? Number(t.company.lastPrice) : null,
          ) ||
          // A single filing can't exceed the whole company's value — either
          // the stored cap or the filed numbers are wrong; both mean the
          // dollar figure is unpublishable.
          (capNum > 0 && Number(t.totalValue) > capNum);
        return {
          id: t.id,
          insiderName: t.insiderName,
          role: t.role,
          rawTitle: t.rawTitle,
          type:
            t.transactionCode === 'S' || t.acquiredDisposed === 'D' ? 'SELL' : 'BUY',
          ticker: t.company?.ticker || null,
          companyName: t.company?.name || '',
          sector: t.company?.sector || null,
          marketCap: t.company?.marketCap != null ? Number(t.company.marketCap) : null,
          sharesBought: Number(t.sharesBought),
          pricePerShare: Number(t.pricePerShare),
          totalValue: Number(t.totalValue),
          /** The filed price fails the shared plausibility guard — render the
           *  dollar figures as "—" and point at the SEC filing instead. */
          priceSuspect: suspect,
          previousHoldings: t.previousHoldings === null ? null : Number(t.previousHoldings),
          transactionDate: t.transactionDate,
          filingUrl: this.form4Link(t.filingUrl, t.accessionNumber),
          transactionCode: t.transactionCode,
          ...classify(t),
        };
        });
      })(),
    };
  }

  /** Normalize a stored filing URL so clicking it opens the human-readable
   *  Form 4, not raw XML or a folder listing:
   *   - a raw `.../{acc}/{doc}.xml` (no XSL) → the XSL-rendered viewer path
   *     `.../{acc}/xslF345X05/{doc}` (SEC applies the stylesheet server-side),
   *   - a bare folder index (ends with "/") → the SEC filing detail page. */
  private form4Link(
    filingUrl: string | null | undefined,
    accession: string | null | undefined,
  ): string {
    const url = filingUrl || '';
    if (!url) return url;
    const raw = url.match(
      /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/)([^/]+\.xml)$/i,
    );
    if (raw && !/\/xsl/i.test(url)) return `${raw[1]}xslF345X05/${raw[2]}`;
    if (url.endsWith('/') && accession) return `${url}${accession}-index.htm`;
    return url;
  }

  /** Volume-weighted insider avg cost + last open-market buy date, keyed by
   *  ticker — computed across Form 4 'P' buys in the scoring window (90d,
   *  WINDOWS.buys) for any stock with insider purchases, not just the scored
   *  rankings universe. Windowed + sanity-guarded so a single mis-filed price
   *  (e.g. NMM's $748,119/share) can never publish an absurd avg cost. */
  async getInsiderCostBasis(
    tickers: string[],
  ): Promise<Map<string, { avgCost: number | null; lastBuyDate: string | null }>> {
    const map = new Map<string, { avgCost: number | null; lastBuyDate: string | null }>();
    const ups = Array.from(
      new Set(tickers.filter(Boolean).map((t) => t.toUpperCase())),
    );
    if (!ups.length) return map;
    const since = new Date(Date.now() - WINDOWS.buys * 86400 * 1000);
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.company', 'c')
      .select('UPPER(c.ticker)', 'ticker')
      .addSelect('SUM(t."sharesBought" * t."pricePerShare")', 'val')
      .addSelect('SUM(t."sharesBought")', 'sh')
      .addSelect('MAX(t."transactionDate")', 'lastBuy')
      .where('UPPER(c.ticker) IN (:...ups)', { ups })
      .andWhere(`t."transactionCode" = 'P'`)
      .andWhere('t."transactionDate" >= :since', { since })
      .andWhere(plausibleTxSql('t', 'c'))
      .groupBy('UPPER(c.ticker)')
      .getRawMany();
    for (const r of rows) {
      const sh = Number(r.sh) || 0;
      map.set(String(r.ticker), {
        avgCost: sh > 0 ? +(Number(r.val) / sh).toFixed(2) : null,
        lastBuyDate: r.lastBuy
          ? new Date(r.lastBuy).toISOString().slice(0, 10)
          : null,
      });
    }
    // Fill any requested tickers our SEC subset doesn't cover from FMP's
    // market-wide insider feed (real, just a broader source).
    if (this.fmp.enabled) {
      const need = ups.filter((t) => !map.has(t));
      if (need.length) {
        const fmpMap = await this.fmp.getInsiderCostBasisMap();
        for (const t of need) {
          const f = fmpMap.get(t);
          if (f && f.avgCost != null) map.set(t, f);
        }
      }
    }
    return map;
  }

  async getVolumeSeries(daysBack: number) {
    const since = new Date(Date.now() - daysBack * 86400 * 1000);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.txRepo
      .createQueryBuilder('t')
      .where('t.transactionDate >= :since', { since })
      .andWhere(`t."transactionCode" = 'P'`)
      .getMany();

    const totalCount = rows.length;
    const totalValue = rows.reduce((a, t) => a + Number(t.totalValue), 0);

    const byRole = {
      CEO: 0,
      CFO: 0,
      COO: 0,
      Director: 0,
      Other: 0,
    } as Record<string, number>;
    for (const t of rows) byRole[t.role] = (byRole[t.role] || 0) + Number(t.totalValue);

    const dayMs = 86400000;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const buckets: { date: string; count: number; value: number }[] = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * dayMs);
      buckets.push({ date: day.toISOString().slice(0, 10), count: 0, value: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.date, i]));
    for (const t of rows) {
      const k = new Date(t.transactionDate).toISOString().slice(0, 10);
      const i = idx.get(k);
      if (i === undefined) continue;
      buckets[i].count += 1;
      buckets[i].value += Number(t.totalValue);
    }

    return {
      windowDays: daysBack,
      totalCount,
      totalValue,
      avgPerDay: totalCount / Math.max(1, daysBack),
      byRole,
      series: buckets,
    };
  }

  async getIdeas() {
    const qb = this.scores
      .createQueryBuilder('s')
      .innerJoin(Company, 'c', 'c.id = s.company_id')
      .where('s.asOfDate = (SELECT MAX("asOfDate") FROM iqs_scores)')
      .select([
        's.company_id as "companyId"',
        'c.ticker as ticker',
        'c.name as name',
        'c.sector as sector',
        'c."marketCap" as "marketCap"',
        's.iqs as iqs',
        's."distinctBuyers" as "distinctBuyers"',
        's."transactionCount" as "transactionCount"',
        's."totalPurchaseValue" as "totalPurchaseValue"',
      ]);

    const all = await qb.getRawMany();
    const rows = all.map((r: any) => ({
      companyId: r.companyId,
      ticker: r.ticker,
      name: r.name,
      sector: r.sector,
      marketCap: r.marketCap !== null ? Number(r.marketCap) : null,
      iqs: Number(r.iqs),
      distinctBuyers: Number(r.distinctBuyers),
      transactionCount: Number(r.transactionCount),
      totalPurchaseValue: Number(r.totalPurchaseValue),
    }));

    const byIqs = [...rows].sort((a, b) => b.iqs - a.iqs);
    const cluster = rows.filter((r) => r.distinctBuyers >= 2).sort((a, b) => b.iqs - a.iqs);
    const megacap = rows
      .filter((r) => (r.marketCap || 0) >= 1e10)
      .sort((a, b) => b.iqs - a.iqs);
    const smallcap = rows
      .filter((r) => r.marketCap !== null && r.marketCap < 5e8 && r.iqs >= 50)
      .sort((a, b) => b.iqs - a.iqs);
    const byValue = [...rows].sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue);

    return {
      lists: [
        {
          slug: 'highest-conviction',
          title: 'Highest conviction',
          subtitle: 'Top-ranked by Insider Score',
          rows: byIqs.slice(0, 10),
        },
        {
          slug: 'cluster-buying',
          title: 'Cluster buying alerts',
          subtitle: 'Multiple insiders accumulating in concert',
          rows: cluster.slice(0, 10),
        },
        {
          slug: 'mega-cap-moves',
          title: 'Mega-cap insider moves',
          subtitle: 'Companies above $10B with fresh insider buys',
          rows: megacap.slice(0, 10),
        },
        {
          slug: 'small-cap-conviction',
          title: 'Small-cap conviction',
          subtitle: 'Under $500M with strong Insider Score — biggest potential, biggest risk',
          rows: smallcap.slice(0, 10),
        },
        {
          slug: 'biggest-dollar-buys',
          title: 'Biggest dollar buys',
          subtitle: 'Ranked by total purchase value',
          rows: byValue.slice(0, 10),
        },
      ],
    };
  }

  /** Names that read as an investment vehicle rather than a natural person —
   *  funds, advisers and partnerships that file Form 4 as 10% owners. We can't
   *  tell a hedge fund from a PE firm or family office by name alone, so this is
   *  the whole fund/institution class, not strictly hedge funds. */
  private static readonly FUND_NAME =
    /\b(capital|partners?|management|advisors?|advisers?|asset|fund|funds|holdings?|ventures?|equity|investments?|lp|llc|l\.p|l\.l\.c|trust|group)\b/i;

  async getTopInsiders(
    limit = 20,
    country?: string,
    group?: 'ceo' | 'cfo' | 'hedge-fund' | 'politician',
  ) {
    // Politicians aren't corporate insiders and never appear in Form 4 — this
    // preset reads the congressional disclosure dataset instead.
    if (group === 'politician') return this.congress.topBuyers(limit);

    const qb = this.txRepo
      .createQueryBuilder('t')
      .where(`t."transactionCode" = 'P'`)
      // Exclude parse artifacts so the leaderboard ranks real buying, not a
      // bad filing inflating one name to billions.
      .andWhere(plausibleTxSql('t', 'c'))
      .leftJoinAndSelect('t.company', 'c');
    if (country) qb.andWhere('t."insiderCountry" = :country', { country });
    if (group === 'ceo') qb.andWhere(`t."role" = 'CEO'`);
    if (group === 'cfo') qb.andWhere(`t."role" = 'CFO'`);
    if (group === 'hedge-fund') {
      // Funds file as 10% owners, so they land in the catch-all roles rather
      // than an officer title; the name is what identifies them.
      qb.andWhere(`t."role" NOT IN ('CEO','CFO','COO')`);
    }
    const rows = await qb.getMany();
    const agg = new Map<
      string,
      {
        name: string;
        role: string;
        ticker: string | null;
        company: string;
        city: string | null;
        state: string | null;
        country: string | null;
        totalValue: number;
        trades: number;
      }
    >();
    for (const t of rows) {
      const key = `${t.insiderName.toLowerCase()}|${t.companyId}`;
      const cur = agg.get(key) || {
        name: t.insiderName,
        role: t.role,
        ticker: t.company?.ticker || null,
        company: t.company?.name || '',
        city: t.insiderCity || null,
        state: t.insiderState || null,
        country: t.insiderCountry || null,
        totalValue: 0,
        trades: 0,
      };
      // Fill location from whichever row has it.
      if (!cur.city && t.insiderCity) cur.city = t.insiderCity;
      if (!cur.state && t.insiderState) cur.state = t.insiderState;
      if (!cur.country && t.insiderCountry) cur.country = t.insiderCountry;
      cur.totalValue += Number(t.totalValue);
      cur.trades += 1;
      agg.set(key, cur);
    }
    let out = Array.from(agg.values());
    if (group === 'hedge-fund') {
      out = out.filter((r) => IqsService.FUND_NAME.test(r.name));
    }
    return out.sort((a, b) => b.totalValue - a.totalValue).slice(0, limit);
  }

  /**
   * Raw Form 4 activity facts for one company — the grounding for the
   * "What Are Insiders Doing?" summary. Counts every code we store, split into
   * the categories a reader actually cares about, and estimates insider
   * ownership from the latest post-transaction holding of each filer.
   */
  async getInsiderActivityFacts(tickerRaw: string) {
    const ticker = (tickerRaw || '').toUpperCase();
    const company = await this.companies.findOne({ where: { ticker } });
    if (!company) return null;

    const tx = await this.txRepo
      .createQueryBuilder('t')
      .where('t.company_id = :id', { id: company.id })
      .orderBy('t."transactionDate"', 'DESC')
      .getMany();
    if (!tx.length) return null;

    const num = (v: unknown) => Number(v) || 0;
    const isCode = (c: string, codes: string[]) => codes.includes((c || '').toUpperCase());

    const buys = tx.filter((t) => isCode(t.transactionCode, ['P']));
    const sells = tx.filter((t) => isCode(t.transactionCode, ['S']));

    // Latest post-transaction holding per filer — a FLOOR on insider ownership,
    // since it only counts insiders who have actually filed a transaction.
    const latestByInsider = new Map<string, number>();
    for (const t of tx) {
      const key = t.insiderName.trim().toLowerCase();
      if (!latestByInsider.has(key)) latestByInsider.set(key, num(t.postHoldings));
    }
    const insiderShares = Array.from(latestByInsider.values()).reduce((a, b) => a + b, 0);

    const dates = tx.map((t) => new Date(t.transactionDate).toISOString().slice(0, 10)).sort();
    const roles = Array.from(new Set(tx.map((t) => t.role).filter(Boolean)));

    // Anything outside P/S only exists for filings ingested after the parser
    // was widened, so report whether we actually have that view for this name.
    const nonTrade = tx.filter((t) => !isCode(t.transactionCode, ['P', 'S']));

    return {
      symbol: ticker,
      name: company.name,
      buyCount: buys.length,
      buyValue: buys.reduce((a, t) => a + num(t.totalValue), 0),
      buyShares: buys.reduce((a, t) => a + num(t.sharesBought), 0),
      sellCount: sells.length,
      sellValue: sells.reduce((a, t) => a + num(t.totalValue), 0),
      sellShares: sells.reduce((a, t) => a + num(t.sharesBought), 0),
      distinctBuyers: new Set(buys.map((t) => t.insiderName.toLowerCase())).size,
      distinctSellers: new Set(sells.map((t) => t.insiderName.toLowerCase())).size,
      topRoles: roles.slice(0, 5),
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      insiderShares,
      awardCount: tx.filter((t) => isCode(t.transactionCode, ['A'])).length,
      optionExerciseCount: tx.filter((t) => isCode(t.transactionCode, ['M', 'X'])).length,
      taxWithholdCount: tx.filter((t) => isCode(t.transactionCode, ['F'])).length,
      giftCount: tx.filter((t) => isCode(t.transactionCode, ['G'])).length,
      otherCount: tx.filter((t) => isCode(t.transactionCode, ['J', 'C'])).length,
      nonTradeDataAvailable: nonTrade.length > 0,
    };
  }

  /** Per-insider track record: the share of an insider's open-market buys that
   *  are currently trading ABOVE their purchase price (i.e. "in profit" vs the
   *  live price). Accuracy = winning buys ÷ total buys. Only insiders with a
   *  meaningful sample (≥2 buys priced against a live quote) are returned. */
  async getInsiderTrackRecords(limit = 8) {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .where(`t."transactionCode" = 'P'`)
      .andWhere(plausibleTxSql('t', 'c'))
      .leftJoinAndSelect('t.company', 'c')
      .getMany();

    const agg = new Map<
      string,
      {
        name: string;
        role: string;
        ticker: string | null;
        wins: number;
        total: number;
        totalValue: number;
      }
    >();
    for (const t of rows) {
      const cur = t.company?.lastPrice ? Number(t.company.lastPrice) : 0;
      const buyPx = Number(t.pricePerShare);
      if (!buyPx || cur <= 0) continue; // need both a purchase price and a live price
      const key = t.insiderName.toLowerCase();
      const e =
        agg.get(key) || {
          name: t.insiderName,
          role: t.role,
          ticker: t.company?.ticker || null,
          wins: 0,
          total: 0,
          totalValue: 0,
        };
      e.total += 1;
      if (cur > buyPx) e.wins += 1;
      e.totalValue += Number(t.totalValue);
      agg.set(key, e);
    }

    return Array.from(agg.values())
      .filter((e) => e.total >= 2)
      .map((e) => ({
        name: e.name,
        role: e.role,
        ticker: e.ticker,
        trades: e.total,
        wins: e.wins,
        accuracy: Math.round((e.wins / e.total) * 100),
        totalValue: e.totalValue,
      }))
      .sort((a, b) => b.accuracy - a.accuracy || b.trades - a.trades)
      .slice(0, limit);
  }

  /** Full profile for ONE insider (keyed by name, case-insensitive) — powers
   *  the QuiverQuant-style insider profile page: headline stats, buy/sell
   *  track record vs the live price, top tickers & sectors, and the full trade
   *  history. Implausible-price parse artifacts are excluded. */
  async getInsiderProfile(name: string) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const txs = await this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.company', 'c')
      .where('LOWER(t."insiderName") = LOWER(:name)', { name: clean })
      .andWhere(`t."transactionCode" IN ('P','S')`)
      // Exclude implausible parse artifacts (e.g. billions into a nano-cap) so
      // a bad filing can't dominate the profile's totals — shared guard.
      .andWhere(plausibleTxSql('t', 'c'))
      .orderBy('t.transactionDate', 'DESC')
      .getMany();
    if (!txs.length) return null;

    const displayName = txs[0].insiderName;
    const roles = new Set<string>();
    const companies = new Map<string, { ticker: string | null; name: string; trades: number }>();
    const tickerAgg = new Map<
      string,
      { ticker: string; name: string; sector: string | null; buys: number; sells: number; buyValue: number; sellValue: number }
    >();
    const sectorAgg = new Map<string, number>();

    let buyCount = 0;
    let sellCount = 0;
    let totalBought = 0;
    let totalSold = 0;
    let wins = 0;
    let scored = 0;
    let firstDate = txs[txs.length - 1].transactionDate;
    let lastDate = txs[0].transactionDate;

    const trades = txs.map((t) => {
      const value = Number(t.totalValue) || 0;
      const buyPx = Number(t.pricePerShare) || 0;
      const isBuy = t.transactionCode === 'P';
      const livePrice = t.company?.lastPrice ? Number(t.company.lastPrice) : null;
      if (t.role) roles.add(t.role);
      if (t.company) {
        const cid = t.companyId;
        const c = companies.get(cid) || {
          ticker: t.company.ticker || null,
          name: t.company.name || '',
          trades: 0,
        };
        c.trades += 1;
        companies.set(cid, c);
      }
      const sym = (t.company?.ticker || '').toUpperCase();
      if (sym) {
        const ta = tickerAgg.get(sym) || {
          ticker: sym,
          name: t.company?.name || sym,
          sector: t.company?.sector || null,
          buys: 0,
          sells: 0,
          buyValue: 0,
          sellValue: 0,
        };
        if (isBuy) {
          ta.buys += 1;
          ta.buyValue += value;
        } else {
          ta.sells += 1;
          ta.sellValue += value;
        }
        tickerAgg.set(sym, ta);
      }
      const sec = t.company?.sector;
      if (sec) sectorAgg.set(sec, (sectorAgg.get(sec) || 0) + 1);

      if (isBuy) {
        buyCount += 1;
        totalBought += value;
        // Track record: is this buy currently above its purchase price?
        if (buyPx > 0 && livePrice && livePrice > 0) {
          scored += 1;
          if (livePrice > buyPx) wins += 1;
        }
      } else {
        sellCount += 1;
        totalSold += value;
      }
      if (t.transactionDate < firstDate) firstDate = t.transactionDate;
      if (t.transactionDate > lastDate) lastDate = t.transactionDate;

      // Per-buy return vs live price (buys only — sells have no forward return).
      const returnPct =
        isBuy && buyPx > 0 && livePrice && livePrice > 0
          ? +(((livePrice - buyPx) / buyPx) * 100).toFixed(2)
          : null;
      return {
        ticker: t.company?.ticker || null,
        company: t.company?.name || '',
        sector: t.company?.sector || null,
        side: isBuy ? 'BUY' : 'SELL',
        role: t.role,
        shares: Number(t.sharesBought) || 0,
        pricePerShare: buyPx,
        totalValue: value,
        livePrice,
        returnPct,
        transactionDate: t.transactionDate,
        filingUrl: this.form4Link(t.filingUrl, t.accessionNumber),
      };
    });

    const primaryCompany = Array.from(companies.values()).sort(
      (a, b) => b.trades - a.trades,
    )[0];

    const topTickers = Array.from(tickerAgg.values())
      .map((t) => ({ ...t, totalValue: t.buyValue + t.sellValue, trades: t.buys + t.sells }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 12);

    const topSectors = Array.from(sectorAgg.entries())
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const buyTrades = trades.filter((t) => t.returnPct != null);
    const bestTrade = buyTrades.length
      ? [...buyTrades].sort((a, b) => (b.returnPct as number) - (a.returnPct as number))[0]
      : null;
    const avgReturn = buyTrades.length
      ? +(buyTrades.reduce((a, t) => a + (t.returnPct as number), 0) / buyTrades.length).toFixed(2)
      : null;

    return {
      name: displayName,
      roles: Array.from(roles),
      primaryCompany: primaryCompany
        ? { ticker: primaryCompany.ticker, name: primaryCompany.name }
        : null,
      stats: {
        totalTrades: trades.length,
        buyCount,
        sellCount,
        totalBought,
        totalSold,
        distinctCompanies: companies.size,
        firstTraded: firstDate,
        lastTraded: lastDate,
        winRate: scored >= 2 ? Math.round((wins / scored) * 100) : null,
        scoredBuys: scored,
        avgBuyReturnPct: avgReturn,
      },
      bestTrade,
      topTickers,
      topSectors,
      trades,
    };
  }

  /** "Top Stocks" ranking — the site's second branded score. Blends the
   *  analyst pillar (consensus + implied upside), the Insider Score, and the
   *  insiders' historical success rate into one 0–99 conviction score
   *  (analyst success rate slot is wired, pending a per-analyst provider). */
  async getTopStocks(limit = 200): Promise<
    Array<{
      symbol: string;
      name: string;
      sector: string | null;
      price: number;
      targetMean: number | null;
      targetHigh: number | null;
      targetLow: number | null;
      upsidePct: number | null;
      recommendation: string | null;
      numAnalysts: number | null;
      iqs: number | null;
      insiderSuccess: number | null;
      topStocksScore: number | null;
    }>
  > {
    const [analystRows, rank] = await Promise.all([
      this.marketStats.getAnalystRatings(),
      this.getRankings({ limit: 500, offset: 0 }),
    ]);
    const bySym = new Map(
      rank.rows.map((r) => [(r.ticker || '').toUpperCase(), r]),
    );
    return analystRows
      .map((a) => {
        const rk = bySym.get(a.symbol.toUpperCase());
        const insiderScore = rk?.iqs != null ? Number(rk.iqs) : null;
        const insiderSuccess =
          rk?.historicalSuccessWeight != null
            ? Number(rk.historicalSuccessWeight)
            : null;
        const score = topStocksScore({
          insiderScore,
          insiderSuccess,
          analystScore: analystPillarScore(a.recommendation, a.upsidePct),
          analystSuccess: null, // TODO: activate with a per-analyst data provider
        });
        return {
          symbol: a.symbol,
          name: a.name,
          sector: a.sector,
          price: a.price,
          targetMean: a.targetMean,
          targetHigh: a.targetHigh,
          targetLow: a.targetLow,
          upsidePct: a.upsidePct,
          recommendation: a.recommendation,
          numAnalysts: a.numAnalysts,
          iqs: insiderScore,
          insiderSuccess,
          topStocksScore: score,
        };
      })
      .filter((r) => r.topStocksScore != null)
      .sort((x, y) => (y.topStocksScore ?? 0) - (x.topStocksScore ?? 0))
      .slice(0, limit);
  }

  /** Composite 0–100 score for one ticker — insider pillar (our Insider
   *  Score) + analyst pillar (consensus/upside) + sentiment pillar (recent
   *  headlines scored by AI). See composite-score.ts for the model. */
  async getCompositeScore(ticker: string): Promise<
    CompositeScore & {
      ticker: string;
      insiderScore: number | null;
      sentimentRationale: string | null;
    }
  > {
    const sym = (ticker || '').toUpperCase();

    // Insider pillar — latest stored Insider Score for the company.
    let insider: number | null = null;
    const company = await this.companies
      .createQueryBuilder('c')
      .where('UPPER(c.ticker) = :t', { t: sym })
      .getOne();
    if (company) {
      const scoreRow = await this.scores
        .createQueryBuilder('s')
        .where('s.company_id = :id', { id: company.id })
        .orderBy('s."asOfDate"', 'DESC')
        .getOne();
      if (scoreRow) insider = Number(scoreRow.iqs);
    }

    // Analyst pillar — consensus + implied upside from the live feed.
    let analyst: number | null = null;
    try {
      const rows = await this.marketStats.getAnalystRatings([sym]);
      const row = rows.find((r) => r.symbol.toUpperCase() === sym);
      if (row) analyst = analystPillarScore(row.recommendation, row.upsidePct);
    } catch {
      analyst = null;
    }

    // Sentiment pillar — recent headlines scored by AI (cached 12h per ticker).
    let sentimentValue: number | null = null;
    let sentimentRationale: string | null = null;
    try {
      const s = await this.sentiment.getSentimentScore(sym, company?.name);
      sentimentValue = s?.score ?? null;
      sentimentRationale = s?.rationale ?? null;
    } catch {
      sentimentValue = null;
    }

    const composite = computeCompositeScore([
      { key: 'insider', value: insider },
      { key: 'analyst', value: analyst },
      { key: 'sentiment', value: sentimentValue },
    ]);
    return { ticker: sym, insiderScore: insider, sentimentRationale, ...composite };
  }

  // ── v2.1 §6.3 / §7.4 — insider profile administration ────────────────────

  /** All pedigree/litigation profiles (flags parsed) — analyst tooling. */
  async listInsiderProfiles() {
    const rows = await this.profiles.find({ order: { updatedAt: 'DESC' } });
    return rows.map((p) => ({
      id: p.id,
      nameKey: p.nameKey,
      cik: p.cik,
      displayName: p.displayName,
      flags: JSON.parse(p.flags || '[]'),
      litigationMatters: JSON.parse(p.litigationMatters || '[]'),
      evidence: JSON.parse(p.evidence || '[]'),
      reviewedBy: p.reviewedBy,
      suppressed: p.suppressed,
      updatedAt: p.updatedAt,
    }));
  }

  /** Upsert a reviewed insider profile (spec §6.3 step 4: major_exit,
   *  billionaire and all litigation flags require analyst confirmation —
   *  pass reviewedBy). The §7.4 correction workflow is the same call with
   *  suppressed=true, which removes the profile from scoring immediately;
   *  the next recalc reflects it. */
  async upsertInsiderProfile(body: {
    name?: string;
    cik?: string | null;
    displayName?: string | null;
    flags?: string[];
    litigationMatters?: unknown[];
    evidence?: unknown[];
    reviewedBy?: string | null;
    suppressed?: boolean;
  }) {
    const nameKey = (body?.name || '').trim().toLowerCase();
    if (!nameKey) return { ok: false, error: 'name is required (as filed on Form 4)' };
    const existing = await this.profiles.findOne({ where: { nameKey } });
    const row = this.profiles.create({
      ...(existing ? { id: existing.id } : {}),
      nameKey,
      cik: body.cik ?? existing?.cik ?? null,
      displayName: body.displayName ?? existing?.displayName ?? body.name ?? null,
      flags: JSON.stringify(body.flags ?? JSON.parse(existing?.flags || '[]')),
      litigationMatters: JSON.stringify(
        body.litigationMatters ?? JSON.parse(existing?.litigationMatters || '[]'),
      ),
      evidence: JSON.stringify(body.evidence ?? JSON.parse(existing?.evidence || '[]')),
      reviewedBy: body.reviewedBy ?? existing?.reviewedBy ?? null,
      suppressed: body.suppressed ?? existing?.suppressed ?? false,
    });
    const saved = await this.profiles.save(row);
    return { ok: true, id: saved.id, nameKey: saved.nameKey };
  }

  /** Distinct insider countries present in the data, with counts — drives the
   *  country filter UI (only shows countries we actually have). */
  async getInsiderCountries(): Promise<Array<{ country: string; count: number }>> {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t."insiderCountry"', 'country')
      .addSelect('COUNT(DISTINCT t.insiderName)', 'count')
      .where(`t."transactionCode" = 'P'`)
      .andWhere('t."insiderCountry" IS NOT NULL')
      .groupBy('t."insiderCountry"')
      .orderBy('count', 'DESC')
      .getRawMany<{ country: string; count: string }>();
    return rows.map((r) => ({ country: r.country, count: Number(r.count) }));
  }

  // ───────────────────────────────────────────────────────────────
  // Insider buying vs selling by sector (last N days)
  // ───────────────────────────────────────────────────────────────
  async getSectorFlows(daysBack = 30) {
    const since = new Date(Date.now() - daysBack * 86400000);
    const txs = await this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.company', 'c')
      .where('t.transactionDate >= :since', { since })
      .getMany();

    const agg = new Map<
      string,
      { buyValue: number; sellValue: number; buyCount: number; sellCount: number }
    >();
    for (const t of txs) {
      const v = Number(t.totalValue);
      // Skip non-open-market codes (grants/exercises) and implausible parse
      // artifacts so sector flows show real, sane dollar figures.
      if (t.transactionCode !== 'P' && t.transactionCode !== 'S') continue;
      if (!Number.isFinite(v) || v <= 0 || v > MAX_PLAUSIBLE_TX_VALUE) continue;
      const sec = t.company?.sector || 'Other';
      const cur =
        agg.get(sec) || { buyValue: 0, sellValue: 0, buyCount: 0, sellCount: 0 };
      if (t.transactionCode === 'S') {
        cur.sellValue += v;
        cur.sellCount += 1;
      } else {
        cur.buyValue += v;
        cur.buyCount += 1;
      }
      agg.set(sec, cur);
    }
    const sectors = Array.from(agg.entries())
      .map(([sector, v]) => ({
        sector,
        ...v,
        netValue: v.buyValue - v.sellValue,
      }))
      .sort((a, b) => b.buyValue + b.sellValue - (a.buyValue + a.sellValue));
    return { windowDays: daysBack, sectors };
  }

  // ───────────────────────────────────────────────────────────────
  // Monthly insider buy vs sell meter (resets each calendar month)
  // ───────────────────────────────────────────────────────────────
  async getMonthlyBuySellMeter() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t."transactionCode"', 'code')
      .addSelect('COALESCE(SUM(t."totalValue"), 0)', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('t."transactionDate" >= :start', { start: monthStart.toISOString() })
      // Data-quality guard: exclude implausible parse artifacts (a single
      // Form 4 with a bad share count/price can otherwise inflate the total to
      // absurd figures like "$1600T bought"). Same ceiling the scorer uses.
      .andWhere(plausibleTxSql('t'))
      .groupBy('t."transactionCode"')
      .getRawMany<{ code: string; value: string; count: string }>();

    let buyVolume = 0;
    let sellVolume = 0;
    let totalBuys = 0;
    let totalSells = 0;
    for (const r of rows) {
      const v = Number(r.value || 0);
      const c = Number(r.count || 0);
      // P = purchase (buy on open market), S = sale, A/M = grant/award (skip)
      if (r.code === 'P') {
        buyVolume += v;
        totalBuys += c;
      } else if (r.code === 'S') {
        sellVolume += v;
        totalSells += c;
      }
    }
    const denom = buyVolume + sellVolume;
    const ratio = denom > 0 ? buyVolume / denom : 0.5;
    return {
      month: monthStart.toISOString().slice(0, 7),
      year: now.getFullYear(),
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      buyVolume,
      sellVolume,
      ratio,
      totalBuys,
      totalSells,
    };
  }

  /** Current-calendar-month insider buy/sell COUNTS per ticker (open-market
   *  P = buy, S = sell). Keyed by UPPERCASE ticker. Used by the Hot Sectors
   *  ranking to tally insider activity across each thematic basket. */
  async getMonthlyBuySellByTicker(
    tickers: string[],
  ): Promise<Map<string, { buys: number; sells: number }>> {
    const map = new Map<string, { buys: number; sells: number }>();
    const ups = Array.from(
      new Set(tickers.filter(Boolean).map((t) => t.toUpperCase())),
    );
    if (!ups.length) return map;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.company', 'c')
      .select('UPPER(c.ticker)', 'ticker')
      .addSelect('t."transactionCode"', 'code')
      .addSelect('COUNT(*)', 'count')
      .where('UPPER(c.ticker) IN (:...ups)', { ups })
      .andWhere('t."transactionDate" >= :ms', { ms: monthStart.toISOString() })
      .andWhere(`t."transactionCode" IN ('P','S')`)
      .groupBy('UPPER(c.ticker)')
      .addGroupBy('t."transactionCode"')
      .getRawMany<{ ticker: string; code: string; count: string }>();
    for (const r of rows) {
      const e = map.get(r.ticker) || { buys: 0, sells: 0 };
      if (r.code === 'P') e.buys += Number(r.count);
      else if (r.code === 'S') e.sells += Number(r.count);
      map.set(r.ticker, e);
    }
    return map;
  }

  // ───────────────────────────────────────────────────────────────
  // Prediction of the day — deterministic top-IQS company w/ blurb
  // ───────────────────────────────────────────────────────────────
  async getPredictionOfTheDay() {
    const { rows } = await this.getRankings({ limit: 1, offset: 0 });
    const pick = rows[0];
    if (!pick) return null;
    const reasons: string[] = [];
    if (pick.distinctBuyers >= 2)
      reasons.push(`${pick.distinctBuyers} insiders bought within days of each other`);
    if (pick.insiderWeight >= 85)
      reasons.push('CEO/CFO-level buying — the highest-signal insider roles');
    if (pick.transactionWeight >= 70)
      reasons.push('purchase size is large for this company');
    if (pick.convictionWeight >= 60)
      reasons.push('insiders meaningfully grew their personal stakes');
    if (pick.marketTimingWeight >= 70)
      reasons.push('buying near the 52-week low — possible value conviction');
    const why = reasons.length
      ? reasons.join(' · ')
      : 'top-ranked single signal in our daily Insider Score run';
    return {
      ticker: pick.ticker,
      name: pick.name,
      sector: pick.sector,
      iqs: pick.iqs,
      bought: pick.totalPurchaseValue,
      buyers: pick.distinctBuyers,
      why,
      asOfDate: new Date().toISOString().slice(0, 10),
    };
  }
}
