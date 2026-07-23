import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { Company } from '../entities/company.entity';
import { CONGRESS_SEED } from './congressional-seed';
import { PhotosService } from './photos.service';
import { CivicService } from './civic.service';
import { FmpService } from '../fmp/fmp.service';
import { MarketStatsService } from '../market-stats/market-stats.service';

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
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly dataSource: DataSource,
    private readonly photos: PhotosService,
    private readonly fmp: FmpService,
    private readonly marketStats: MarketStatsService,
    private readonly civic: CivicService,
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
        excessReturn: null as number | null,
      };
    });

    const topTickers = Array.from(tickerAgg.values())
      .map((t) => ({ ...t, trades: t.buys + t.sells }))
      .sort((a, b) => b.estValue - a.estValue)
      .slice(0, 12);

    // Trade Volume by Year (buy vs sell, est. $) — QuiverQuant's bar chart.
    const yearMap = new Map<number, { buy: number; sell: number }>();
    for (const t of txs) {
      const yr = new Date(t.transactionDate).getUTCFullYear();
      const e = yearMap.get(yr) || { buy: 0, sell: 0 };
      if (t.action === 'Buy') e.buy += mid(t);
      else e.sell += mid(t);
      yearMap.set(yr, e);
    }
    const volumeByYear = Array.from(yearMap.entries())
      .map(([year, v]) => ({ year, buyValue: v.buy, sellValue: v.sell }))
      .sort((a, b) => a.year - b.year);

    // Top Traded Sectors — sector resolved from our company table by ticker.
    const symbols = Array.from(tickerAgg.keys());
    const sectorByTicker = new Map<string, string>();
    if (symbols.length) {
      const comps = await this.companies
        .createQueryBuilder('c')
        .select(['c.ticker AS ticker', 'c.sector AS sector'])
        .where('UPPER(c.ticker) IN (:...syms)', { syms: symbols })
        .getRawMany<{ ticker: string; sector: string | null }>();
      for (const c of comps) {
        if (c.ticker && c.sector) sectorByTicker.set(c.ticker.toUpperCase(), c.sector);
      }
    }
    const sectorAgg = new Map<string, { trades: number; estValue: number }>();
    for (const ta of tickerAgg.values()) {
      const sec = sectorByTicker.get(ta.ticker) || 'Other';
      const e = sectorAgg.get(sec) || { trades: 0, estValue: 0 };
      e.trades += ta.buys + ta.sells;
      e.estValue += ta.estValue;
      sectorAgg.set(sec, e);
    }
    const topSectors = Array.from(sectorAgg.entries())
      .map(([sector, v]) => ({ sector, ...v }))
      .sort((a, b) => b.estValue - a.estValue)
      .slice(0, 8);

    // Estimated Live Stock Portfolio — net (buys − sells) est. $ per ticker,
    // positive positions only, as an allocation %. Approximation from disclosed
    // ranges (QuiverQuant shows a similar disclaimer).
    const netByTicker = new Map<string, { ticker: string; company: string; net: number }>();
    for (const t of txs) {
      const sym = (t.ticker || '').toUpperCase();
      if (!sym) continue;
      const e = netByTicker.get(sym) || { ticker: sym, company: t.companyName || sym, net: 0 };
      e.net += t.action === 'Buy' ? mid(t) : -mid(t);
      netByTicker.set(sym, e);
    }
    const held = Array.from(netByTicker.values()).filter((h) => h.net > 0);

    // ── Real price history → per-trade Excess Return + estimated portfolio
    //    value over time (vs SPY). All from real Yahoo daily closes. ────────
    const priceSymbols = Array.from(tickerAgg.keys()).slice(0, 25);
    const histBySym = new Map<string, Array<{ t: number; c: number }>>();
    let spyHist: Array<{ t: number; c: number }> = [];
    try {
      const [spy, ...hists] = await Promise.all([
        this.marketStats.getCloseHistory('SPY'),
        ...priceSymbols.map((s) => this.marketStats.getCloseHistory(s)),
      ]);
      spyHist = spy;
      priceSymbols.forEach((s, i) => histBySym.set(s, hists[i]));
    } catch {
      /* price history unavailable — excess return / value chart degrade to null */
    }
    const nowMs = Date.now();
    const spyNow = spyHist.length ? spyHist[spyHist.length - 1].c : null;

    // Attach real excess return (stock vs SPY since the trade) to each trade.
    for (const tr of trades) {
      const sym = (tr.ticker || '').toUpperCase();
      const hist = histBySym.get(sym);
      if (!hist || !hist.length || !spyNow) continue;
      const tMs = new Date(tr.transactionDate).getTime();
      const atTrade = MarketStatsService.closeOn(hist, tMs);
      const stockNow = hist[hist.length - 1].c;
      const spyAt = MarketStatsService.closeOn(spyHist, tMs);
      if (atTrade && atTrade > 0 && spyAt && spyAt > 0) {
        const stockRet = stockNow / atTrade - 1;
        const spyRet = spyNow / spyAt - 1;
        tr.excessReturn = +((stockRet - spyRet) * 100).toFixed(2);
      }
    }

    // Estimated disclosed-stock portfolio value over time: convert each buy's
    // midpoint $ into shares at that day's price, accumulate (net of sells),
    // then value the running share counts at ~monthly sampled closes. This is
    // an ESTIMATE from disclosed trades — labelled as such in the UI.
    const sharesBySym = new Map<string, number>();
    const chrono = [...txs].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime(),
    );
    const portfolioSeries: Array<{ date: string; value: number }> = [];
    if (histBySym.size) {
      // Build monthly sample points from first trade → now.
      const start = new Date(firstDate);
      start.setUTCDate(1);
      const points: number[] = [];
      for (let d = new Date(start); d.getTime() <= nowMs; d.setUTCMonth(d.getUTCMonth() + 1)) {
        points.push(d.getTime());
      }
      points.push(nowMs);
      let ti = 0;
      for (const pt of points) {
        // Apply all trades up to this sample point.
        while (ti < chrono.length && new Date(chrono[ti].transactionDate).getTime() <= pt) {
          const t = chrono[ti];
          const sym = (t.ticker || '').toUpperCase();
          const hist = histBySym.get(sym);
          const px = hist ? MarketStatsService.closeOn(hist, new Date(t.transactionDate).getTime()) : null;
          if (sym && px && px > 0) {
            const sh = mid(t) / px;
            sharesBySym.set(sym, (sharesBySym.get(sym) || 0) + (t.action === 'Buy' ? sh : -sh));
          }
          ti++;
        }
        let val = 0;
        for (const [sym, sh] of sharesBySym) {
          if (sh <= 0) continue;
          const hist = histBySym.get(sym);
          const px = hist ? MarketStatsService.closeOn(hist, pt) : null;
          if (px) val += sh * px;
        }
        portfolioSeries.push({ date: new Date(pt).toISOString().slice(0, 10), value: Math.round(val) });
      }
    }
    const estPortfolioValue = portfolioSeries.length
      ? portfolioSeries[portfolioSeries.length - 1].value
      : null;

    // Live portfolio (current) valued at latest price where we have shares.
    const portfolio = held
      .map((h) => {
        const sh = sharesBySym.get(h.ticker);
        const hist = histBySym.get(h.ticker);
        const live = sh && sh > 0 && hist?.length ? sh * hist[hist.length - 1].c : h.net;
        return { ticker: h.ticker, company: h.company, estValue: Math.round(live) };
      })
      .filter((h) => h.estValue > 0)
      .sort((a, b) => b.estValue - a.estValue)
      .slice(0, 15);
    const portTotal = portfolio.reduce((a, h) => a + h.estValue, 0);
    const portfolioWithAlloc = portfolio.map((h) => ({
      ...h,
      allocation: portTotal > 0 ? +((h.estValue / portTotal) * 100).toFixed(2) : 0,
    }));

    // Civic data (Congress.gov legislation + FEC fundraising) — both degrade to
    // null/[] when their API key isn't configured, so the UI shows a connect state.
    const [legislation, fundraising] = await Promise.all([
      this.civic.getSponsoredLegislation(first.politicianName).catch(() => []),
      this.civic.getFundraising(first.politicianName).catch(() => null),
    ]);

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
        estPortfolioValue,
        distinctTickers: tickerAgg.size,
        firstTraded: firstDate,
        lastTraded: lastDate,
      },
      topTickers,
      volumeByYear,
      topSectors,
      portfolio: portfolioWithAlloc,
      portfolioSeries,
      trades,
      legislation,
      fundraising,
    };
  }
}
