import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CqsScore } from '../entities/cqs-score.entity';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { IqsScore } from '../entities/iqs-score.entity';
import { Company } from '../entities/company.entity';
import { FlagEngineService } from '../congress-trades/flag-engine.service';
import {
  assembleCqsScore,
  scoreC1ClusterBreadth,
  scoreC2PositionSize,
  scoreC3CommitteeInfluence,
  scoreC4ContractAlignment,
  scoreC5BuyerTrackRecord,
  scoreC6RelativeConviction,
  scoreC7Freshness,
  scoreC8NetDirection,
} from './cqs-math';

export interface CqsLeaderboardQuery {
  limit?: number;
  offset?: number;
  sector?: string;
  party?: string;
  minScore?: number;
  search?: string;
}

@Injectable()
export class CqsService {
  private readonly logger = new Logger(CqsService.name);

  constructor(
    @InjectRepository(CqsScore)
    private readonly cqsRepo: Repository<CqsScore>,
    @InjectRepository(CongressionalTransaction)
    private readonly txRepo: Repository<CongressionalTransaction>,
    @InjectRepository(IqsScore)
    private readonly iqsRepo: Repository<IqsScore>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly flagEngine: FlagEngineService,
  ) {}

  /**
   * Recalculates CQS scores for all qualified stocks within trailing 90 days.
   */
  async recalculateAll(asOfDate?: string): Promise<{ computed: number }> {
    const todayStr = asOfDate || new Date().toISOString().slice(0, 10);
    const windowStart = new Date(Date.now() - 90 * 86400000);

    // Fetch all congressional trades in trailing 90 days
    const trades = await this.txRepo.find({
      where: {},
    });

    const recentTrades = trades.filter(
      (t) => new Date(t.transactionDate) >= windowStart,
    );

    // Group by ticker
    const byTicker = new Map<string, CongressionalTransaction[]>();
    for (const t of recentTrades) {
      if (!t.ticker) continue;
      const sym = t.ticker.toUpperCase().trim();
      if (!byTicker.has(sym)) byTicker.set(sym, []);
      byTicker.get(sym)!.push(t);
    }

    let count = 0;
    for (const [ticker, txs] of byTicker.entries()) {
      const buys = txs.filter((t) => t.action === 'Buy');
      const sells = txs.filter((t) => t.action === 'Sell');

      if (buys.length === 0) continue;

      // 1. Check Qualification Triggers (Brief v9 §1)
      const distinctBuyers = new Set(buys.map((b) => b.politicianName));
      const hasSizeTrigger = buys.some(
        (b) => (b.amountMin != null ? Number(b.amountMin) : 0) >= 100_001,
      );
      const hasClusterTrigger =
        distinctBuyers.size >= 2 &&
        buys.some(
          (b) => (b.amountMin != null ? Number(b.amountMin) : 0) >= 15_001,
        );

      const flags = await this.flagEngine.forTicker(ticker);
      const hasInfluenceTrigger = flags.length > 0;

      if (!hasSizeTrigger && !hasClusterTrigger && !hasInfluenceTrigger) {
        continue; // Unqualified stock
      }

      // 2. Party Mix & Bipartisan check
      const partyMap = { R: 0, D: 0, I: 0 };
      for (const b of buys) {
        const p = (b.party || '').toUpperCase().charAt(0);
        if (p === 'R') partyMap.R++;
        else if (p === 'D') partyMap.D++;
        else partyMap.I++;
      }
      const isBipartisan = partyMap.R > 0 && partyMap.D > 0;

      // 3. Est Buy Value & Band Floors
      let totalEstBuyValue = 0;
      const bandFloors: number[] = [];
      let maxBandFloor = 0;

      for (const b of buys) {
        const minVal = b.amountMin != null ? Number(b.amountMin) : 15_001;
        const maxVal = b.amountMax != null ? Number(b.amountMax) : minVal * 2;
        const estMid = (minVal + maxVal) / 2;
        totalEstBuyValue += estMid;
        bandFloors.push(minVal);
        if (minVal > maxBandFloor) maxBandFloor = minVal;
      }

      const sellValue = sells.reduce((acc, s) => {
        const minVal = s.amountMin != null ? Number(s.amountMin) : 15_001;
        const maxVal = s.amountMax != null ? Number(s.amountMax) : minVal * 2;
        return acc + (minVal + maxVal) / 2;
      }, 0);

      // 4. Freshness
      const newestTx = buys.reduce(
        (latest, b) =>
          new Date(b.transactionDate) > new Date(latest.transactionDate)
            ? b
            : latest,
        buys[0],
      );
      const daysSinceTx = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(newestTx.transactionDate).getTime()) /
            86_400_000,
        ),
      );

      // 5. Query IQS Score & Company Metadata
      const iqsRow = await this.iqsRepo.findOne({
        where: { company: { ticker } },
        order: { asOfDate: 'DESC' },
      });
      const company = await this.companyRepo.findOne({ where: { ticker } });

      // 6. Calculate C1 - C8 Components
      const c1 = scoreC1ClusterBreadth(distinctBuyers.size, isBipartisan);
      const c2 = scoreC2PositionSize(bandFloors);
      const c3 = scoreC3CommitteeInfluence(
        ['Member'],
        hasInfluenceTrigger,
      );
      const c4 = scoreC4ContractAlignment(
        flags.length > 0 ? Number(flags[0].score) : null,
      );
      const c5 = scoreC5BuyerTrackRecord([]);
      const c6 = scoreC6RelativeConviction(maxBandFloor, 50_001, false);
      const c7 = scoreC7Freshness(daysSinceTx);
      const c8 = scoreC8NetDirection(totalEstBuyValue, sellValue);

      const components = {
        c1ClusterBreadth: c1,
        c2PositionSize: c2,
        c3CommitteeInfluence: c3,
        c4ContractAlignment: c4,
        c5BuyerTrackRecord: c5,
        c6RelativeConviction: c6,
        c7Freshness: c7,
        c8NetDirection: c8,
      };

      const multipliersInput = {
        iqsScore: iqsRow?.iqs ? Number(iqsRow.iqs) : null,
        hasLegislativeCatalyst: false,
        priceVs52wHighPct: null,
        totalBuyVsAdvPct: null,
        marketCap: company?.marketCap ? Number(company.marketCap) : null,
        avgFilingLagDays: 20,
      };

      const assembled = assembleCqsScore(components, multipliersInput);

      // Save/Upsert CqsScore record
      let cqsRecord = await this.cqsRepo.findOne({
        where: { ticker, asOfDate: todayStr, windowDays: 90 },
      });
      if (!cqsRecord) {
        cqsRecord = this.cqsRepo.create({
          ticker,
          asOfDate: todayStr,
          windowDays: 90,
        });
      }

      cqsRecord.companyName = company?.name || buys[0].companyName || ticker;
      cqsRecord.cqs = assembled.cqs;
      cqsRecord.grade = assembled.grade;
      cqsRecord.isGoldRing = assembled.isGoldRing;
      cqsRecord.c1ClusterBreadth = c1;
      cqsRecord.c2PositionSize = c2;
      cqsRecord.c3CommitteeInfluence = c3;
      cqsRecord.c4ContractAlignment = c4;
      cqsRecord.c5BuyerTrackRecord = c5;
      cqsRecord.c6RelativeConviction = c6;
      cqsRecord.c7Freshness = c7;
      cqsRecord.c8NetDirection = c8;

      cqsRecord.multiplierInsiderOverlap =
        assembled.multipliersResult.insiderOverlap;
      cqsRecord.multiplierLegislativeCatalyst =
        assembled.multipliersResult.legislativeCatalyst;
      cqsRecord.multiplierContrarianEntry =
        assembled.multipliersResult.contrarianEntry;
      cqsRecord.multiplierLiquidityNorm =
        assembled.multipliersResult.liquidityNorm;
      cqsRecord.multiplierFilingLag = assembled.multipliersResult.filingLag;

      cqsRecord.distinctMembers = distinctBuyers.size;
      cqsRecord.isBipartisan = isBipartisan;
      cqsRecord.partyCounts = partyMap;
      cqsRecord.totalEstBuyValue = totalEstBuyValue;
      cqsRecord.largestSingleBand = `$${maxBandFloor.toLocaleString()}+`;
      cqsRecord.buyCount = buys.length;
      cqsRecord.sellCount = sells.length;
      cqsRecord.sector = company?.sector || null;
      cqsRecord.marketCap = company?.marketCap
        ? Number(company.marketCap)
        : null;

      await this.cqsRepo.save(cqsRecord);
      count++;
    }

    this.logger.log(`Calculated CQS scores for ${count} qualified tickers.`);
    return { computed: count };
  }

  async getLeaderboard(query: CqsLeaderboardQuery): Promise<{
    rows: CqsScore[];
    total: number;
  }> {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const qb = this.cqsRepo.createQueryBuilder('cqs');

    if (query.sector) {
      qb.andWhere('cqs.sector ILIKE :sector', { sector: `%${query.sector}%` });
    }
    if (query.minScore != null) {
      qb.andWhere('cqs.cqs >= :minScore', { minScore: query.minScore });
    }
    if (query.search) {
      qb.andWhere(
        '(cqs.ticker ILIKE :search OR cqs.companyName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('cqs.cqs', 'DESC').addOrderBy('cqs.updatedAt', 'DESC');

    const [rows, total] = await qb
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { rows, total };
  }

  async getByTicker(ticker: string): Promise<CqsScore | null> {
    return this.cqsRepo.findOne({
      where: { ticker: ticker.toUpperCase().trim() },
      order: { asOfDate: 'DESC' },
    });
  }
}
