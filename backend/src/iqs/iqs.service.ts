import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { IqsScore } from '../entities/iqs-score.entity';
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
import { ROLE_MULTIPLIER, NORM } from './scoring-config';
import {
  assembleComposite,
  computeBuyingScore,
  scoreCluster,
  scoreDilution,
  scoreHoldingChange,
  scoreMomentum,
  scoreOwnershipPctIncrease,
  scorePriceVsBuys,
  scoreRole,
  scoreVolumeVsMarketCap,
} from './iq-score-v2';

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
// A single open-market Form 4 purchase above this is almost certainly a parse
// artifact (the largest real insider buys are low hundreds of millions) — such
// rows are excluded from score aggregates so one bad filing can't distort them.
const MAX_PLAUSIBLE_TX_VALUE = 1_000_000_000;

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
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderTransaction) private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(IqsScore) private readonly scores: Repository<IqsScore>,
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
  async recalculateAll(windowDays = 90): Promise<number> {
    const since = new Date(Date.now() - windowDays * 86400000);
    const seasonedCutoff = new Date(Date.now() - 14 * 86400000);
    const today = new Date().toISOString().slice(0, 10);
    const companies = await this.companies.find();
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

    for (const company of companies) {
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
        continue;
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

      let totalPurchaseValue = 0; // Σ shares × price
      let totalShares = 0; // Σ shares (for insider VWAP)
      let roleWeightedValue = 0; // Σ shares × price × role multiplier
      const buyers = new Set<string>();
      const holdingChangePcts: number[] = []; // D: per-buyer % add
      // F: role-weighted ownership % increase
      let ownWeightedSum = 0;
      let ownWeightSum = 0;

      for (const t of txs) {
        const shares = Number(t.sharesBought);
        const value = shares * Number(t.pricePerShare);
        // Data-quality guard: skip implausible parse artifacts so one bad
        // filing can't blow up the aggregates (and the market-cap check below).
        if (!Number.isFinite(value) || value <= 0 || value > MAX_PLAUSIBLE_TX_VALUE) {
          continue;
        }
        const roleMult = ROLE_MULTIPLIER[t.role] ?? ROLE_MULTIPLIER.Other;
        totalPurchaseValue += value;
        totalShares += shares;
        roleWeightedValue += value * roleMult;
        buyers.add(t.insiderName.toLowerCase());
        const prev = Number(t.previousHoldings) || 0;
        if (prev > 0) {
          const frac = shares / prev; // relative stake growth
          holdingChangePcts.push(frac * 100); // D (percent)
          ownWeightedSum += Math.min(frac, NORM.ownershipPctCap) * roleMult; // F
          ownWeightSum += roleMult;
        } else {
          // First-time buyer (held 0 before) — maximum relative commitment.
          ownWeightedSum += NORM.ownershipPctCap * roleMult;
          ownWeightSum += roleMult;
        }
      }

      // Data-quality guard: a cap smaller than the observed insider buying is
      // impossible — treat it as unknown rather than producing absurd factors.
      const safeCap = sanitizedMarketCap(marketCap, totalPurchaseValue) ?? 0;
      const insiderVwap = totalShares > 0 ? totalPurchaseValue / totalShares : null;

      // ── Component 1: Insider Buying (6 sub-factors, each 0–100) ──────────
      const subVolume = scoreVolumeVsMarketCap(safeCap > 0 ? totalPurchaseValue / safeCap : null);
      const subCluster = scoreCluster(buyers.size);
      const subRole = scoreRole(safeCap > 0 ? roleWeightedValue / safeCap : null);
      const subHolding = scoreHoldingChange(
        holdingChangePcts.length
          ? holdingChangePcts.reduce((a, b) => a + b, 0) / holdingChangePcts.length
          : null,
      );
      const subPriceVsBuys = scorePriceVsBuys(insiderVwap, lastPrice > 0 ? lastPrice : null);
      const subOwnership = scoreOwnershipPctIncrease(
        ownWeightSum > 0 ? ownWeightedSum / ownWeightSum : null,
      );
      const buyingScore = computeBuyingScore({
        volumeVsMarketCap: subVolume,
        cluster: subCluster,
        role: subRole,
        holdingChange: subHolding,
        priceVsBuys: subPriceVsBuys,
        ownershipPctIncrease: subOwnership,
      });

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

      // ── Composite (weighted; missing components → neutral 50) ───────────
      const composite = assembleComposite({
        buying: buyingScore,
        sector: sectorScore,
        mda: mdaScore,
        momentum: momentumScore,
        dilution: dilutionScore,
      });
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
        dilutionScore: round2(dilutionScore),
        dataCompleteness: +composite.dataCompleteness.toFixed(4),
        subVolumeVsMcap: round2(subVolume),
        subCluster: round2(subCluster),
        subRole: round2(subRole),
        subHoldingChange: round2(subHolding),
        subPriceVsBuys: round2(subPriceVsBuys),
        subOwnershipPct: round2(subOwnership),
        // legacy display columns
        insiderWeight: +(subRole ?? 0).toFixed(2),
        transactionWeight: +(subVolume ?? 0).toFixed(2),
        convictionWeight: +(subOwnership ?? subHolding ?? 0).toFixed(2),
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
    }
    return updated;
  }

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
    }));

    // Average insider cost + last buy date per company — computed from the
    // Form 4 open-market buys (one grouped query for the whole page).
    if (rows.length) {
      const ids = rows.map((r) => r.companyId);
      const aggs = await this.txRepo
        .createQueryBuilder('t')
        .select('t.company_id', 'companyId')
        .addSelect('SUM(t."sharesBought" * t."pricePerShare")', 'val')
        .addSelect('SUM(t."sharesBought")', 'sh')
        .addSelect('MAX(t."transactionDate")', 'lastBuy')
        .where('t.company_id IN (:...ids)', { ids })
        .andWhere(`t."transactionCode" = 'P'`)
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
      }

      // Insider-type category flags — which roles / filer types bought each
      // company (open-market 'P' only). Powers the "Cluster / CEO / CFO /
      // Hedge Funds" preset filter on the rankings table. Cluster is derived
      // client-side from distinctBuyers ≥ 2.
      const roleRows = await this.txRepo
        .createQueryBuilder('t')
        .select('t.company_id', 'companyId')
        .addSelect('t.role', 'role')
        .addSelect('t."insiderName"', 'insiderName')
        .where('t.company_id IN (:...ids)', { ids })
        .andWhere(`t."transactionCode" = 'P'`)
        .getRawMany();
      const catByCompany = new Map<
        string,
        { ceo: boolean; cfo: boolean; fund: boolean }
      >();
      // Entity-style names (funds / institutional 10% owners) vs. individuals.
      const FUND_RE =
        /\b(L\.?P\.?|L\.?L\.?C\.?|Capital|Partners?|Management|Advisor|Adviser|Fund|Holdings?|Ventures?|Asset|Investments?|Group|Trust|Securities)\b/i;
      for (const rr of roleRows) {
        const cur =
          catByCompany.get(rr.companyId) || { ceo: false, cfo: false, fund: false };
        if (rr.role === 'CEO') cur.ceo = true;
        if (rr.role === 'CFO') cur.cfo = true;
        if (FUND_RE.test(String(rr.insiderName || ''))) cur.fund = true;
        catByCompany.set(rr.companyId, cur);
      }
      for (const r of rows) {
        const c = catByCompany.get(r.companyId);
        r.hasCeoBuyer = !!c?.ceo;
        r.hasCfoBuyer = !!c?.cfo;
        r.hasFundBuyer = !!c?.fund;
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

    return { total, rows };
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

    let transactions: any[] = txRows.map((t) => ({
      ...t,
      type: t.transactionCode === 'S' ? 'SELL' : 'BUY',
      sharesBought: Number(t.sharesBought),
      pricePerShare: Number(t.pricePerShare),
      totalValue: Number(t.totalValue),
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
      // Hide Form 4 parse artifacts (e.g. a "$40,000,000/share" price) so a
      // single bad filing never shows an absurd multi-trillion-dollar trade.
      .where('t."pricePerShare" <= :maxPrice', { maxPrice: 1_000_000 })
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
    else if (opts.side === 'all') qb.andWhere(`t."transactionCode" IN ('P','S')`);
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
      rows: rows.map((t) => ({
        id: t.id,
        insiderName: t.insiderName,
        role: t.role,
        rawTitle: t.rawTitle,
        type: t.transactionCode === 'S' ? 'SELL' : 'BUY',
        ticker: t.company?.ticker || null,
        companyName: t.company?.name || '',
        sector: t.company?.sector || null,
        marketCap: t.company?.marketCap != null ? Number(t.company.marketCap) : null,
        sharesBought: Number(t.sharesBought),
        pricePerShare: Number(t.pricePerShare),
        totalValue: Number(t.totalValue),
        previousHoldings: t.previousHoldings === null ? null : Number(t.previousHoldings),
        transactionDate: t.transactionDate,
        filingUrl: this.form4Link(t.filingUrl, t.accessionNumber),
      })),
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
   *  ticker — computed across ALL Form 4 'P' buys (not just the scored
   *  rankings universe), so any stock with insider purchases populates. */
  async getInsiderCostBasis(
    tickers: string[],
  ): Promise<Map<string, { avgCost: number | null; lastBuyDate: string | null }>> {
    const map = new Map<string, { avgCost: number | null; lastBuyDate: string | null }>();
    const ups = Array.from(
      new Set(tickers.filter(Boolean).map((t) => t.toUpperCase())),
    );
    if (!ups.length) return map;
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.company', 'c')
      .select('UPPER(c.ticker)', 'ticker')
      .addSelect('SUM(t."sharesBought" * t."pricePerShare")', 'val')
      .addSelect('SUM(t."sharesBought")', 'sh')
      .addSelect('MAX(t."transactionDate")', 'lastBuy')
      .where('UPPER(c.ticker) IN (:...ups)', { ups })
      .andWhere(`t."transactionCode" = 'P'`)
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
      .andWhere('t."pricePerShare" <= :maxPrice', { maxPrice: 1_000_000 })
      .andWhere('t."totalValue" > 0 AND t."totalValue" <= :maxTx', {
        maxTx: MAX_PLAUSIBLE_TX_VALUE,
      })
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

  /** Per-insider track record: the share of an insider's open-market buys that
   *  are currently trading ABOVE their purchase price (i.e. "in profit" vs the
   *  live price). Accuracy = winning buys ÷ total buys. Only insiders with a
   *  meaningful sample (≥2 buys priced against a live quote) are returned. */
  async getInsiderTrackRecords(limit = 8) {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .where(`t."transactionCode" = 'P'`)
      .andWhere('t."pricePerShare" <= :maxPrice', { maxPrice: 1_000_000 })
      .andWhere('t."totalValue" > 0 AND t."totalValue" <= :maxTx', {
        maxTx: MAX_PLAUSIBLE_TX_VALUE,
      })
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
      .andWhere('t."pricePerShare" <= :maxPrice', { maxPrice: 1_000_000 })
      // Exclude implausible parse artifacts (e.g. billions into a nano-cap) so
      // a bad filing can't dominate the profile's totals — same cap as scoring.
      .andWhere('t."totalValue" > 0 AND t."totalValue" <= :maxTx', {
        maxTx: MAX_PLAUSIBLE_TX_VALUE,
      })
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
      .andWhere('t."totalValue" > 0')
      .andWhere('t."totalValue" <= :maxTx', { maxTx: MAX_PLAUSIBLE_TX_VALUE })
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
