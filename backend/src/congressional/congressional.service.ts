import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { CONGRESS_SEED } from './congressional-seed';
import { PhotosService } from './photos.service';
import { FmpService } from '../fmp/fmp.service';

/** Valid, finite Date or null — guards against FMP rows with missing/garbage
 *  dates that would otherwise become `Invalid Date` and fail the insert. */
function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class CongressionalService implements OnModuleInit {
  private readonly logger = new Logger(CongressionalService.name);

  constructor(
    @InjectRepository(CongressionalTransaction)
    private readonly repo: Repository<CongressionalTransaction>,
    private readonly dataSource: DataSource,
    private readonly photos: PhotosService,
    private readonly fmp: FmpService,
  ) {}

  async onModuleInit() {
    // Each step is independently guarded so one failure can never leave the
    // table empty (the original bug: a failed FMP save wiped it with no re-seed).
    try {
      await this.refreshFromFmp();
    } catch (err: any) {
      this.logger.warn(`Congressional FMP refresh failed: ${err?.message || err}`);
    }
    try {
      await this.ensureSeeded();
    } catch (err: any) {
      this.logger.warn(`Congressional seed failed: ${err?.message || err}`);
    }
    void this.backfillPhotos();
  }

  /** Guarantee the table is never empty — seed the sample set if there are no
   *  rows (self-heal, regardless of what FMP did). */
  async ensureSeeded(): Promise<number> {
    if ((await this.repo.count()) > 0) return 0;
    this.logger.log(`Seeding ${CONGRESS_SEED.length} congressional disclosures…`);
    const rows = CONGRESS_SEED.map((r) => ({
      politicianName: r.politicianName,
      chamber: r.chamber === 'Senate' ? 'Senate' : 'House',
      party: r.party,
      ticker: r.ticker,
      companyName: r.companyName,
      action: r.action,
      amountMin: r.amountMin,
      amountMax: r.amountMax,
      transactionDate: safeDate(r.transactionDate) ?? new Date(),
      reportedDate: safeDate(r.reportedDate) ?? new Date(),
      source: 'sample-seed',
    }));
    await this.repo.save(rows as any);
    this.logger.log('Congressional seed complete.');
    return rows.length;
  }

  /** Pull the latest real Senate + House disclosures from FMP and replace the
   *  table with them. Returns false when FMP is unavailable / returns nothing
   *  (so the caller falls back to the seed). The replace runs in a TRANSACTION
   *  so a failed insert never wipes the table (the original empty-table bug). */
  async refreshFromFmp(): Promise<boolean> {
    if (!this.fmp.enabled) return false;
    const trades = await this.fmp.getCongressional(2);
    if (!trades.length) return false;
    const seen = new Set<string>();
    const rows = trades
      .filter((t) => {
        const k = `${t.politicianName}|${t.ticker}|${t.transactionDate}|${t.action}|${t.amountMin}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((t) => ({
        politicianName: t.politicianName,
        chamber: t.chamber,
        party: t.party,
        ticker: t.ticker,
        companyName: t.companyName,
        action: t.action,
        amountMin: t.amountMin,
        amountMax: t.amountMax,
        transactionDate: safeDate(t.transactionDate),
        reportedDate: safeDate(t.reportedDate) ?? safeDate(t.transactionDate),
        source: 'fmp',
      }))
      // Drop rows with no usable transaction date — they'd fail the insert and
      // (pre-fix) roll back / wipe the whole table.
      .filter((r) => r.transactionDate != null);
    if (!rows.length) return false;
    await this.dataSource.transaction(async (m) => {
      await m.clear(CongressionalTransaction);
      await m.save(CongressionalTransaction, rows as any);
    });
    this.logger.log(`Ingested ${rows.length} real congressional disclosures from FMP.`);
    return true;
  }

  /** Manual re-ingest (FMP → else ensure seeded). Powers a refresh endpoint so
   *  prod can be repopulated without a redeploy. */
  async refresh(): Promise<{ source: string; total: number }> {
    let source = 'existing';
    try {
      if (await this.refreshFromFmp()) source = 'fmp';
    } catch (err: any) {
      this.logger.warn(`Congressional FMP refresh failed: ${err?.message || err}`);
    }
    const seeded = await this.ensureSeeded();
    if (seeded > 0 && source === 'existing') source = 'sample-seed';
    void this.backfillPhotos();
    return { source, total: await this.repo.count() };
  }

  private async backfillPhotos() {
    try {
      const missing = await this.repo.find({
        where: { photoUrl: IsNull() },
      });
      const seenName = new Set<string>();
      for (const row of missing) {
        if (seenName.has(row.politicianName)) continue;
        seenName.add(row.politicianName);
        const url = await this.photos.getPhoto(row.politicianName);
        await this.repo.update(
          { politicianName: row.politicianName },
          { photoUrl: url },
        );
      }
      this.logger.log(
        `Photo backfill complete for ${seenName.size} unique politicians.`,
      );
    } catch (err: any) {
      this.logger.warn(`Photo backfill error: ${err?.message || err}`);
    }
  }

  async list(opts: {
    ticker?: string;
    politician?: string;
    chamber?: 'House' | 'Senate';
    days?: number;
    limit?: number;
  }) {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.transactionDate', 'DESC');
    if (opts.ticker) qb.andWhere('UPPER(t.ticker) = UPPER(:ticker)', { ticker: opts.ticker });
    if (opts.politician)
      qb.andWhere('t.politicianName ILIKE :p', { p: `%${opts.politician}%` });
    if (opts.chamber) qb.andWhere('t.chamber = :chamber', { chamber: opts.chamber });
    if (opts.days && opts.days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - opts.days);
      qb.andWhere('t.transactionDate >= :since', { since });
    }
    qb.limit(opts.limit ?? 100);
    return qb.getMany();
  }

  async byTicker(ticker: string) {
    return this.repo.find({
      where: { ticker: ticker.toUpperCase() },
      order: { transactionDate: 'DESC' },
      take: 50,
    });
  }

  /** Full profile for one member of Congress (by exact name, case-insensitive)
   *  — powers the politician profile page: headline stats, buy/sell split, most
   *  -traded stocks, and full disclosure history. Dollar figures use the
   *  midpoint of each disclosed amount RANGE (STOCK Act reports bands, not
   *  exact values). */
  async getPoliticianProfile(name: string) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const txs = await this.repo
      .createQueryBuilder('t')
      .where('LOWER(t.politicianName) = LOWER(:name)', { name: clean })
      .orderBy('t.transactionDate', 'DESC')
      .getMany();
    if (!txs.length) return null;

    const mid = (r: CongressionalTransaction): number => {
      const lo = r.amountMin != null ? Number(r.amountMin) : 0;
      const hi = r.amountMax != null ? Number(r.amountMax) : lo;
      return hi > 0 ? (lo + hi) / 2 : lo;
    };

    const first = txs[0];
    const tickerAgg = new Map<
      string,
      { ticker: string; company: string; buys: number; sells: number; estValue: number }
    >();
    let buyCount = 0;
    let sellCount = 0;
    let buyValue = 0;
    let sellValue = 0;
    let firstDate = first.transactionDate;
    let lastDate = first.transactionDate;

    const trades = txs.map((t) => {
      const est = mid(t);
      const isBuy = t.action === 'Buy';
      if (isBuy) {
        buyCount += 1;
        buyValue += est;
      } else {
        sellCount += 1;
        sellValue += est;
      }
      const sym = (t.ticker || '').toUpperCase();
      if (sym) {
        const ta = tickerAgg.get(sym) || {
          ticker: sym,
          company: t.companyName || sym,
          buys: 0,
          sells: 0,
          estValue: 0,
        };
        if (isBuy) ta.buys += 1;
        else ta.sells += 1;
        ta.estValue += est;
        tickerAgg.set(sym, ta);
      }
      if (t.transactionDate < firstDate) firstDate = t.transactionDate;
      if (t.transactionDate > lastDate) lastDate = t.transactionDate;
      return {
        ticker: t.ticker || null,
        company: t.companyName,
        action: t.action,
        amountMin: t.amountMin != null ? Number(t.amountMin) : null,
        amountMax: t.amountMax != null ? Number(t.amountMax) : null,
        transactionDate: t.transactionDate,
        reportedDate: t.reportedDate,
      };
    });

    const topTickers = Array.from(tickerAgg.values())
      .map((t) => ({ ...t, trades: t.buys + t.sells }))
      .sort((a, b) => b.estValue - a.estValue)
      .slice(0, 12);

    return {
      name: first.politicianName,
      chamber: first.chamber,
      party: first.party,
      photoUrl: first.photoUrl,
      stats: {
        totalTrades: trades.length,
        buyCount,
        sellCount,
        buyValue,
        sellValue,
        estTotalVolume: buyValue + sellValue,
        distinctTickers: tickerAgg.size,
        firstTraded: firstDate,
        lastTraded: lastDate,
      },
      topTickers,
      trades,
    };
  }
}
