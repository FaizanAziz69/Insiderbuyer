import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { IqsScore } from '../entities/iqs-score.entity';
import { roleMultiplier } from '../common/role.util';

export interface RankingRow {
  rank: number;
  companyId: string;
  ticker: string | null;
  name: string;
  sector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
  iqs: number;
  purchaseVolumeFactor: number;
  clusterFactor: number;
  roleWeightedVolume: number;
  holdingChangeFactor: number;
  distinctBuyers: number;
  transactionCount: number;
  totalPurchaseValue: number;
}

@Injectable()
export class IqsService {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderTransaction) private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(IqsScore) private readonly scores: Repository<IqsScore>,
  ) {}

  async recalculateAll(windowDays = 90): Promise<number> {
    const since = new Date(Date.now() - windowDays * 86400000);
    const today = new Date().toISOString().slice(0, 10);
    const companies = await this.companies.find();
    let updated = 0;

    for (const company of companies) {
      const txs = await this.txRepo
        .createQueryBuilder('t')
        .where('t.company_id = :id', { id: company.id })
        .andWhere('t.transactionDate >= :since', { since })
        .getMany();

      if (!txs.length) {
        await this.scores.delete({ companyId: company.id });
        continue;
      }

      const marketCap = company.marketCap ? Number(company.marketCap) : 0;
      let totalPurchaseValue = 0;
      let roleWeightedValue = 0;
      const buyers = new Set<string>();
      const holdingChanges: number[] = [];

      for (const t of txs) {
        const value = Number(t.sharesBought) * Number(t.pricePerShare);
        totalPurchaseValue += value;
        roleWeightedValue += value * roleMultiplier(t.role);
        buyers.add(t.insiderName.toLowerCase());
        const prev = Number(t.previousHoldings) || 0;
        if (prev > 0) {
          holdingChanges.push((Number(t.sharesBought) / prev) * 100);
        }
      }

      const purchaseVolumeFactor = marketCap > 0 ? totalPurchaseValue / marketCap : 0;
      const clusterFactor = Math.log(1 + buyers.size);
      const roleWeightedVolume = marketCap > 0 ? roleWeightedValue / marketCap : 0;
      const holdingChangeFactor =
        holdingChanges.length > 0
          ? holdingChanges.reduce((a, b) => a + b, 0) / holdingChanges.length
          : 0;

      const composite =
        purchaseVolumeFactor + clusterFactor + roleWeightedVolume + holdingChangeFactor;
      const iqs = Math.log(1 + Math.max(0, composite));

      const existing = await this.scores.findOne({
        where: { companyId: company.id, asOfDate: today },
      });
      const payload: Partial<IqsScore> = {
        companyId: company.id,
        asOfDate: today,
        purchaseVolumeFactor,
        clusterFactor,
        roleWeightedVolume,
        holdingChangeFactor,
        iqs,
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
  }): Promise<{ total: number; rows: RankingRow[] }> {
    const limit = Math.min(opts.limit ?? 50, 500);
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
        'c."marketCap" as "marketCap"',
        'c."lastPrice" as "lastPrice"',
        's.iqs as iqs',
        's."purchaseVolumeFactor" as "purchaseVolumeFactor"',
        's."clusterFactor" as "clusterFactor"',
        's."roleWeightedVolume" as "roleWeightedVolume"',
        's."holdingChangeFactor" as "holdingChangeFactor"',
        's."distinctBuyers" as "distinctBuyers"',
        's."transactionCount" as "transactionCount"',
        's."totalPurchaseValue" as "totalPurchaseValue"',
      ]);

    const countRow = await qb.clone().select('COUNT(*)', 'count').getRawOne<{ count: string }>();
    const total = Number(countRow?.count || 0);

    const raw = await qb.orderBy('s.iqs', 'DESC').limit(limit).offset(offset).getRawMany();

    const rows: RankingRow[] = raw.map((r: any, i: number) => ({
      rank: offset + i + 1,
      companyId: r.companyId,
      ticker: r.ticker,
      name: r.name,
      sector: r.sector,
      marketCap: r.marketCap ? Number(r.marketCap) : null,
      lastPrice: r.lastPrice !== null ? Number(r.lastPrice) : null,
      iqs: Number(r.iqs),
      purchaseVolumeFactor: Number(r.purchaseVolumeFactor),
      clusterFactor: Number(r.clusterFactor),
      roleWeightedVolume: Number(r.roleWeightedVolume),
      holdingChangeFactor: Number(r.holdingChangeFactor),
      distinctBuyers: Number(r.distinctBuyers),
      transactionCount: Number(r.transactionCount),
      totalPurchaseValue: Number(r.totalPurchaseValue),
    }));

    return { total, rows };
  }

  async getCompanyDetail(ticker: string) {
    const company = await this.companies
      .createQueryBuilder('c')
      .where('LOWER(c.ticker) = :t', { t: ticker.toLowerCase() })
      .getOne();
    if (!company) return null;

    const scoreRow = await this.scores
      .createQueryBuilder('s')
      .where('s.company_id = :id', { id: company.id })
      .orderBy('s."asOfDate"', 'DESC')
      .getOne();

    const score = scoreRow
      ? {
          ...scoreRow,
          purchaseVolumeFactor: Number(scoreRow.purchaseVolumeFactor),
          clusterFactor: Number(scoreRow.clusterFactor),
          roleWeightedVolume: Number(scoreRow.roleWeightedVolume),
          holdingChangeFactor: Number(scoreRow.holdingChangeFactor),
          iqs: Number(scoreRow.iqs),
          totalPurchaseValue: Number(scoreRow.totalPurchaseValue),
        }
      : null;

    const txRows = await this.txRepo
      .createQueryBuilder('t')
      .where('t.company_id = :id', { id: company.id })
      .orderBy('t.transactionDate', 'DESC')
      .limit(200)
      .getMany();

    const transactions = txRows.map((t) => ({
      ...t,
      sharesBought: Number(t.sharesBought),
      pricePerShare: Number(t.pricePerShare),
      totalValue: Number(t.totalValue),
      previousHoldings: t.previousHoldings === null ? null : Number(t.previousHoldings),
      postHoldings: t.postHoldings === null ? null : Number(t.postHoldings),
    }));

    const companyOut = {
      ...company,
      lastPrice: company.lastPrice === null ? null : Number(company.lastPrice),
      marketCap: company.marketCap === null ? null : Number(company.marketCap),
    };

    return { company: companyOut, score, transactions };
  }
}
