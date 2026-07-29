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

/** Reduce a company / PAC name to its distinctive core (drop legal + PAC
 *  suffixes) so "UnitedHealth Group Incorporated" and "UNITEDHEALTH GROUP INC
 *  PAC" both normalize to "unitedhealth" for ticker matching. */
function normCompanyName(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(
      /\b(inc|incorporated|corp|corporation|company|co|llc|lp|plc|holdings|group|the|political action committee|pac|employees|fund|good government|for better government|committee|international|association|and|of)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize any Yahoo sector / SEC SIC-description string to one of the 11
 *  clean GICS sectors (so the Top-Traded-Sectors breakdown reads "Information
 *  Technology", not "Computer Communications Equipment"). */
function toGicsSector(raw: string | null | undefined): string {
  const s = (raw || '').toLowerCase();
  if (!s) return 'Other';
  if (/tech|software|semiconductor|computer|internet|information technology|electronic|data process|it services/.test(s)) return 'Information Technology';
  if (/health|pharma|biotech|medical|drug|hospital|life scien|diagnostic|surgical|therapeut/.test(s)) return 'Health Care';
  if (/communication|media|telecom|entertain|broadcast|publish|advertis|wireless|cable/.test(s)) return 'Communication Services';
  if (/bank|financ|insurance|capital market|invest|credit|securit|brokerage|asset manage/.test(s)) return 'Financials';
  if (/energy|oil|gas|petroleum|coal|drilling|pipeline/.test(s)) return 'Energy';
  if (/aerospace|defense|machinery|transport|airline|railroad|construc|engineer|manufactur|industrial|logistics|freight/.test(s)) return 'Industrials';
  if (/consumer defensive|consumer staple|food|beverage|household|tobacco|grocery|personal product|drug store/.test(s)) return 'Consumer Staples';
  if (/consumer cyclical|consumer discretion|retail|auto|apparel|restaurant|travel|leisure|store|hotel|casino|variety|footwear|homebuild|specialty/.test(s)) return 'Consumer Discretionary';
  if (/util|electric power|electric services|water supply|natural gas distribut/.test(s)) return 'Utilities';
  if (/material|metal|mining|gold|silver|copper|steel|chemical|paper|forest|aluminum|fertilizer/.test(s)) return 'Materials';
  if (/real estate|reit|realty/.test(s)) return 'Real Estate';
  return 'Other';
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
    // NO FMP call here — serverless cold starts are frequent and each one
    // burning 2 requests exhausted the free tier's daily quota (429s all day).
    // FMP refresh happens via the daily cron (/ingest/cron) and the manual
    // POST /congressional-trades/refresh; rows accumulate in the DB.
    try {
      await this.ensureSeeded();
    } catch (err: any) {
      this.logger.warn(`Congressional seed failed: ${err?.message || err}`);
    }
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

  /** Pull the latest real Senate + House disclosures from FMP and ACCUMULATE
   *  them — the free tier only serves the latest ~100 rows per chamber, so we
   *  upsert new rows and keep everything already stored. Per-ticker history
   *  builds up with every refresh instead of being wiped each time. */
  async refreshFromFmp(): Promise<boolean> {
    if (!this.fmp.enabled) return false;
    const trades = await this.fmp.getCongressional(1);
    if (!trades.length) return false;
    // Keys of everything already stored (so re-served rows aren't duplicated).
    const dayKey = (d: Date | string | null | undefined) => {
      const dt = d instanceof Date ? d : safeDate(d as any);
      return dt ? dt.toISOString().slice(0, 10) : '';
    };
    const existing = await this.repo.find({
      select: ['politicianName', 'ticker', 'transactionDate', 'action', 'amountMin', 'source'],
    });
    const seen = new Set(
      existing
        .filter((e) => e.source !== 'sample-seed')
        .map((e) => `${e.politicianName}|${e.ticker}|${dayKey(e.transactionDate)}|${e.action}|${Number(e.amountMin) || 0}`),
    );
    const rows = trades
      .filter((t) => {
        const k = `${t.politicianName}|${t.ticker}|${dayKey(t.transactionDate)}|${t.action}|${Number(t.amountMin) || 0}`;
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
      // Drop rows with no usable transaction date — they'd fail the insert.
      .filter((r) => r.transactionDate != null);
    // Once real FMP rows exist, retire the sample seed (real data supersedes it).
    if (rows.length) await this.repo.save(rows as any);
    const realCount = await this.repo.count({ where: { source: 'fmp' } });
    if (realCount > 0) await this.repo.delete({ source: 'sample-seed' });
    this.logger.log(`Congressional refresh: +${rows.length} new FMP disclosures (total real: ${realCount}).`);
    return realCount > 0;
  }

  /** Manual re-ingest (FMP → else ensure seeded). Powers a refresh endpoint so
   *  prod can be repopulated without a redeploy. */
  async refresh(): Promise<{ source: string; total: number; fmpEnabled: boolean; fmpError: string | null }> {
    let source = 'existing';
    let err: string | null = null;
    try {
      if (await this.refreshFromFmp()) source = 'fmp';
    } catch (e: any) {
      err = String(e?.message || e);
      this.logger.warn(`Congressional FMP refresh failed: ${err}`);
    }
    const seeded = await this.ensureSeeded();
    if (seeded > 0 && source === 'existing') source = 'sample-seed';
    void this.backfillPhotos();
    return {
      source,
      total: await this.repo.count(),
      fmpEnabled: this.fmp.enabled,
      fmpError: err || this.fmp.lastError,
    };
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

  /**
   * Members of Congress ranked by disclosed purchase value, in the same row
   * shape as the Form 4 insider leaderboard — this backs the "Politicians"
   * preset on /insiders, which cannot come from Form 4 data (corporate insiders
   * only). The STOCK Act discloses amount BANDS rather than exact values, so
   * each trade is valued at the midpoint of its band.
   */
  async topBuyers(limit = 50) {
    const rows = await this.repo
      .createQueryBuilder('t')
      .where(`t.action = 'Buy'`)
      .getMany();

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
        kind: 'politician';
      }
    >();

    for (const t of rows) {
      const min = t.amountMin == null ? null : Number(t.amountMin);
      const max = t.amountMax == null ? null : Number(t.amountMax);
      const value =
        min != null && max != null ? (min + max) / 2 : (max ?? min ?? 0);
      if (!Number.isFinite(value) || value <= 0) continue;

      const key = `${t.politicianName.toLowerCase()}|${(t.ticker || '').toUpperCase()}`;
      const cur = agg.get(key) || {
        name: t.politicianName,
        role: t.chamber,
        ticker: t.ticker ? t.ticker.toUpperCase() : null,
        company: t.companyName || '',
        city: null,
        state: null,
        country: 'United States',
        totalValue: 0,
        trades: 0,
        kind: 'politician' as const,
      };
      cur.totalValue += value;
      cur.trades += 1;
      agg.set(key, cur);
    }

    return Array.from(agg.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
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

    // Top Traded Sectors — sector from our company table, with a Yahoo
    // assetProfile fallback for tickers we haven't ingested (so well-known
    // names like HD / BAC / XOM resolve to real sectors, not "Other").
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
      const missing = symbols.filter((s) => !sectorByTicker.has(s));
      if (missing.length) {
        try {
          const profiles = await this.marketStats.getCompanyProfiles(missing);
          for (const [sym, prof] of profiles) {
            const sec = prof.sector || prof.industry;
            if (sec) sectorByTicker.set(sym, sec);
          }
        } catch { /* profiles unavailable — those tickers fall to "Other" */ }
      }
    }
    const sectorAgg = new Map<string, { trades: number; estValue: number }>();
    for (const ta of tickerAgg.values()) {
      const sec = toGicsSector(sectorByTicker.get(ta.ticker));
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
    const [legislation, fundraising, pacDonors, outsideSpending, memberInfo, extras] = await Promise.all([
      this.civic.getSponsoredLegislation(first.politicianName).catch(() => []),
      this.civic.getFundraising(first.politicianName).catch(() => null),
      this.civic.getCorporatePacDonors(first.politicianName).catch(() => []),
      this.civic
        .getOutsideSpending(first.politicianName)
        .catch(() => ({ supporters: [], opponents: [] })),
      this.civic.getMemberInfo(first.politicianName).catch(() => null),
      this.civic
        .getMemberExtras(first.politicianName)
        .catch(() => ({ birthYear: null, birthDate: null, bio: null })),
    ]);
    // Exact age from Wikipedia DOB when present, else approximate from the
    // official Congress.gov birth year.
    let age: number | null = null;
    if (extras.birthDate) {
      const d = new Date(extras.birthDate);
      const now = new Date();
      age = now.getUTCFullYear() - d.getUTCFullYear();
      if (
        now.getUTCMonth() < d.getUTCMonth() ||
        (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
      )
        age--;
    } else if (extras.birthYear) {
      age = new Date().getUTCFullYear() - extras.birthYear;
    }

    // Resolve a stock ticker for each corporate PAC donor by matching the PAC
    // name against our company table (strip PAC/legal suffixes → core name).
    const partyLabel = first.party?.startsWith('R')
      ? 'REP'
      : first.party?.startsWith('D')
        ? 'DEM'
        : first.party || null;
    let corporatePacDonors = pacDonors.map((d) => ({ ...d, party: partyLabel }));
    if (pacDonors.length) {
      try {
        const comps = await this.companies
          .createQueryBuilder('c')
          .select(['c.ticker AS ticker', 'c.name AS name'])
          .where("c.ticker IS NOT NULL AND c.ticker <> ''")
          .getRawMany<{ ticker: string; name: string }>();
        const index = comps
          .map((c) => ({ ticker: c.ticker, name: c.name, norm: normCompanyName(c.name) }))
          .filter((c) => c.norm.length >= 4)
          .sort((a, b) => b.norm.length - a.norm.length); // longest (most specific) first
        corporatePacDonors = corporatePacDonors.map((d) => {
          const pacNorm = normCompanyName(d.companyCommittee);
          const hit = index.find((c) => pacNorm.includes(c.norm));
          return hit ? { ...d, ticker: hit.ticker, companyName: hit.name } : d;
        });
      } catch { /* company table unavailable — tickers stay blank */ }

      // Yahoo-search fallback for corporate committees our company table
      // doesn't know (UNH, VZ, STZ…). Strict validation: the committee's
      // lead word must appear in the matched equity's name, so "Winred" or
      // "Gt Farm Team" never get a bogus ticker.
      const cleanPacName = (s: string) =>
        (s || '')
          .toLowerCase()
          .replace(/\(.*?\)/g, ' ')
          .replace(
            /\b(political action committee|employees political fund|political fund|leadership fund|victory fund|members trust|employees?|committee|pac|incorporated|inc|corporation|corp|company|co|llc|group|fund|trust|association|assn|of|the)\b/gi,
            ' ',
          )
          .replace(/[^a-z\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const unresolved = Array.from(
        new Set(corporatePacDonors.filter((d) => !d.ticker).map((d) => d.companyCommittee)),
      ).slice(0, 20);
      const found = new Map<string, { ticker: string; name: string }>();
      await Promise.all(
        unresolved.map(async (committee) => {
          const q = cleanPacName(committee);
          const tokens = q.split(' ').filter((t) => t.length >= 3);
          if (!tokens.length || tokens[0].length < 5) return; // too generic to match safely
          // Require the lead word AND (when present) a second word to appear
          // as whole words in the equity's name; US listings only.
          const needed = Math.min(2, tokens.length);
          try {
            const hits: any[] = await this.marketStats.searchSymbols(q, 5);
            const hit = hits.find((h) => {
              if (h.type !== 'EQUITY' || String(h.symbol).includes('.')) return false;
              const name = String(h.name || '');
              const matched = tokens.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(name)).length;
              return matched >= needed && new RegExp(`\\b${tokens[0]}\\b`, 'i').test(name);
            });
            if (hit) found.set(committee, { ticker: hit.symbol, name: hit.name });
          } catch { /* leave unresolved */ }
        }),
      );
      corporatePacDonors = corporatePacDonors.map((d) => {
        const hit = !d.ticker ? found.get(d.companyCommittee) : null;
        return hit ? { ...d, ticker: hit.ticker, companyName: hit.name } : d;
      });
    }

    return {
      name: first.politicianName,
      chamber: first.chamber,
      party: first.party,
      // Enriched from Congress.gov where matched (real data).
      state: memberInfo?.state ?? null,
      partyName: memberInfo?.party ?? null,
      servedFrom: memberInfo?.servedFrom ?? null,
      photoUrl: memberInfo?.imageUrl || first.photoUrl || null,
      age,
      bio: extras.bio,
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
      corporatePacDonors,
      supporters: outsideSpending.supporters,
      opponents: outsideSpending.opponents,
    };
  }
}
