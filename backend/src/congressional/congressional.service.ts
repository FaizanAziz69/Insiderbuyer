import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { Company } from '../entities/company.entity';
import { BacktestCache } from '../entities/backtest-cache.entity';
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

  // ── Member roster (bioguide → party) ────────────────────────────────
  // FMP's senate-latest/house-latest feeds omit party entirely, so we join
  // against the public @unitedstates legislators roster (bioguide ID first,
  // exact name as fallback). Cached for 7 days.
  private roster: {
    ts: number;
    byBioguide: Map<string, { party: string; name: string }>;
    byName: Map<string, string>;
    /** name(lower) → { state, chamber } for the leaderboard "title" line. */
    metaByName: Map<string, { state: string | null; chamber: string | null }>;
    /** name(lower) → committee names the member sits on (QuiverQuant-style). */
    committeesByName: Map<string, string[]>;
    /** name(lower) → official congressional headshot (bioguide image), which
     *  exists for essentially every sitting member — a far better photo source
     *  than a Wikipedia name-slug guess. */
    photoByName: Map<string, string>;
  } | null = null;

  private async getRoster(): Promise<NonNullable<CongressionalService['roster']>> {
    if (this.roster && Date.now() - this.roster.ts < 7 * 24 * 60 * 60_000) {
      return this.roster;
    }
    const byBioguide = new Map<string, { party: string; name: string }>();
    const byName = new Map<string, string>();
    const metaByName = new Map<string, { state: string | null; chamber: string | null }>();
    const committeesByName = new Map<string, string[]>();
    const photoByName = new Map<string, string>();
    const bioToName = new Map<string, string>(); // bioguide → name(lower)
    try {
      const res = await fetch(
        'https://unitedstates.github.io/congress-legislators/legislators-current.json',
      );
      const members: any[] = await res.json();
      const addNameKeys = (name: string, apply: (k: string) => void) => {
        const low = name.toLowerCase();
        apply(low);
        const parts = low.split(/\s+/);
        if (parts.length > 2) apply(`${parts[0]} ${parts[parts.length - 1]}`);
      };
      for (const m of members) {
        const bid = m?.id?.bioguide;
        const term = m?.terms?.[m.terms.length - 1];
        const party = String(term?.party || '').charAt(0); // D / R / I
        const chamber = term?.type === 'sen' ? 'Senate' : term?.type === 'rep' ? 'House' : null;
        const state = term?.state || null;
        const name = `${m?.name?.first || ''} ${m?.name?.last || ''}`.trim();
        if (bid && party) byBioguide.set(bid, { party, name });
        if (name && party) addNameKeys(name, (k) => byName.set(k, party));
        if (name) {
          addNameKeys(name, (k) => metaByName.set(k, { state, chamber }));
          if (bid) {
            bioToName.set(bid, name.toLowerCase());
            const img = `https://unitedstates.github.io/images/congress/450x550/${bid}.jpg`;
            addNameKeys(name, (k) => photoByName.set(k, img));
          }
        }
      }
      this.logger.log(`Legislator roster loaded: ${byBioguide.size} members.`);
      // Committee memberships (bioguide → committee names).
      try {
        const [memRes, comRes] = await Promise.all([
          fetch('https://unitedstates.github.io/congress-legislators/committee-membership-current.json'),
          fetch('https://unitedstates.github.io/congress-legislators/committees-current.json'),
        ]);
        const membership: Record<string, any[]> = await memRes.json();
        const committees: any[] = await comRes.json();
        const comName = new Map<string, string>();
        for (const c of committees) if (c?.thomas_id) comName.set(c.thomas_id, c.name);
        const bioToComs = new Map<string, string[]>();
        for (const [comId, mems] of Object.entries(membership)) {
          const cname = comName.get(comId.replace(/\d+$/, '')) || comName.get(comId);
          if (!cname) continue;
          for (const mem of mems as any[]) {
            const bid = mem?.bioguide;
            if (!bid) continue;
            const arr = bioToComs.get(bid) || [];
            if (!arr.includes(cname)) arr.push(cname);
            bioToComs.set(bid, arr);
          }
        }
        for (const [bid, coms] of bioToComs) {
          const nm = bioToName.get(bid);
          if (nm) committeesByName.set(nm, coms);
        }
      } catch (e: any) {
        this.logger.warn(`Committee roster fetch failed: ${e?.message || e}`);
      }
    } catch (e: any) {
      this.logger.warn(`Roster fetch failed: ${e?.message || e}`);
    }
    this.roster = { ts: Date.now(), byBioguide, byName, metaByName, committeesByName, photoByName };
    return this.roster;
  }

  /** Fill party on stored rows that miss it (bioguide isn't stored, so this
   *  matches on exact name). Returns how many rows were updated. */
  async backfillParty(): Promise<number> {
    const roster = await this.getRoster();
    if (!roster.byName.size) return 0;
    const rows = await this.repo.find({ where: { party: IsNull() } });
    let updated = 0;
    for (const r of rows) {
      const nm = (r.politicianName || '').toLowerCase().trim();
      const parts = nm.split(/\s+/);
      const party =
        roster.byName.get(nm) ||
        (parts.length > 1 ? roster.byName.get(`${parts[0]} ${parts[parts.length - 1]}`) : undefined);
      if (party) {
        r.party = party;
        await this.repo.save(r);
        updated++;
      }
    }
    if (updated) this.logger.log(`Party backfill: ${updated}/${rows.length} rows updated.`);
    return updated;
  }

  constructor(
    @InjectRepository(CongressionalTransaction)
    private readonly repo: Repository<CongressionalTransaction>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(BacktestCache)
    private readonly kv: Repository<BacktestCache>,
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
    const roster = await this.getRoster();
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
        party:
          t.party ||
          (t.bioguideId && roster.byBioguide.get(t.bioguideId)?.party) ||
          roster.byName.get(t.politicianName.toLowerCase()) ||
          roster.byName.get(
            `${t.politicianName.toLowerCase().split(/\s+/)[0]} ${t.politicianName.toLowerCase().split(/\s+/).pop()}`,
          ) ||
          null,
        ticker: t.ticker,
        companyName: t.companyName,
        action: t.action,
        amountMin: t.amountMin,
        amountMax: t.amountMax,
        transactionDate: safeDate(t.transactionDate),
        reportedDate: safeDate(t.reportedDate) ?? safeDate(t.transactionDate),
        source: 'fmp',
      }))
      // Drop rows with no usable transaction date or ticker — a single such
      // row violates NOT NULL and aborts the whole batch insert.
      .filter((r) => r.transactionDate != null && !!r.ticker);
    // Once real FMP rows exist, retire the sample seed (real data supersedes it).
    if (rows.length) await this.repo.save(rows as any);
    const realCount = await this.repo.count({ where: { source: 'fmp' } });
    if (realCount > 0) await this.repo.delete({ source: 'sample-seed' });
    this.logger.log(`Congressional refresh: +${rows.length} new FMP disclosures (total real: ${realCount}).`);
    try {
      await this.backfillParty();
    } catch (e: any) {
      this.logger.warn(`Party backfill failed: ${e?.message || e}`);
    }
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
      const roster = await this.getRoster();
      // Also retry rows that previously resolved to initials — the official
      // bioguide headshot below covers members a Wikipedia slug guess missed.
      const missing = await this.repo.find({
        where: [{ photoUrl: IsNull() }, { photoUrl: PhotosService.NO_PHOTO }],
      });
      const rosterPhoto = (name: string): string | null => {
        const low = name.toLowerCase();
        if (roster.photoByName.get(low)) return roster.photoByName.get(low)!;
        const parts = low.split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
          const fl = `${parts[0]} ${parts[parts.length - 1]}`;
          if (roster.photoByName.get(fl)) return roster.photoByName.get(fl)!;
        }
        return null;
      };
      const seenName = new Set<string>();
      let fromRoster = 0;
      for (const row of missing) {
        if (seenName.has(row.politicianName)) continue;
        seenName.add(row.politicianName);
        // Official congressional headshot first, Wikipedia only as a fallback.
        const official = rosterPhoto(row.politicianName);
        if (official) fromRoster += 1;
        const url = official ?? (await this.photos.getPhoto(row.politicianName));
        await this.repo.update(
          { politicianName: row.politicianName },
          { photoUrl: url },
        );
      }
      this.logger.log(
        `Photo backfill complete for ${seenName.size} unique politicians (${fromRoster} official headshots).`,
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

    interface Acc {
      name: string;
      role: string;
      ticker: string | null;
      company: string;
      city: string | null;
      state: string | null;
      country: string | null;
      totalValue: number;
      trades: number;
      photoUrl: string | null;
      party: string | null;
      kind: 'politician';
      /** Per-ticker value, so the headline holding is the biggest one. */
      byTicker: Map<string, { value: number; company: string }>;
    }
    // Aggregated per PERSON, not per person+ticker: this is a leaderboard of
    // members, so one member must occupy exactly one row however many tickers
    // they traded.
    const agg = new Map<string, Acc>();

    for (const t of rows) {
      const min = t.amountMin == null ? null : Number(t.amountMin);
      const max = t.amountMax == null ? null : Number(t.amountMax);
      const value =
        min != null && max != null ? (min + max) / 2 : (max ?? min ?? 0);
      if (!Number.isFinite(value) || value <= 0) continue;

      const key = t.politicianName.trim().toLowerCase();
      const cur: Acc =
        agg.get(key) ||
        ({
          name: t.politicianName.trim(),
          role: t.chamber,
          ticker: null,
          company: '',
          city: null,
          state: null,
          country: 'United States',
          totalValue: 0,
          trades: 0,
          photoUrl: null,
          party: null,
          kind: 'politician',
          byTicker: new Map(),
        } as Acc);

      cur.totalValue += value;
      cur.trades += 1;
      if (!cur.photoUrl && t.photoUrl) cur.photoUrl = t.photoUrl;
      if (!cur.party && t.party) cur.party = t.party;
      const tk = (t.ticker || '').toUpperCase();
      if (tk) {
        const slot = cur.byTicker.get(tk) || { value: 0, company: t.companyName || '' };
        slot.value += value;
        if (!slot.company && t.companyName) slot.company = t.companyName;
        cur.byTicker.set(tk, slot);
      }
      agg.set(key, cur);
    }

    return Array.from(agg.values())
      .map((a) => {
        const top = Array.from(a.byTicker.entries()).sort(
          (x, y) => y[1].value - x[1].value,
        )[0];
        const others = a.byTicker.size - 1;
        const { byTicker, ...rest } = a;
        return {
          ...rest,
          ticker: top?.[0] ?? null,
          // The list shows one company line, so name the biggest position and
          // say how many other holdings the total covers.
          company: top
            ? others > 0
              ? `${top[1].company || top[0]} + ${others} more`
              : top[1].company || top[0]
            : '',
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  }

  /** QuiverQuant-style leaderboard of members: party, title, committees,
   *  estimated disclosed-stock portfolio value, win rate + average return on
   *  their BUYS (scored against price history), profitable-buy count, top
   *  holdings and headshot. Powers the redesigned /stock-lists/politicians. */
  private readonly POLI_CACHE_KEY = 'top-politicians-v1';
  private readonly POLI_TTL_MS = 12 * 60 * 60_000;
  private poliMem: { ts: number; rows: any[] } | null = null;

  /**
   * Cached politician leaderboard. The full compute fetches multi-year price
   * history per ticker (~20s cold), so the result is persisted to the generic
   * cache table and read back instantly. A fresh cache serves immediately; a
   * stale/absent one is recomputed synchronously (cron keeps it warm via
   * refreshTopPoliticians so user requests rarely pay that cost).
   */
  async getTopPoliticians(limit = 60): Promise<any[]> {
    if (this.poliMem && Date.now() - this.poliMem.ts < this.POLI_TTL_MS) {
      return this.poliMem.rows.slice(0, limit);
    }
    const cached = await this.kv.findOne({ where: { key: this.POLI_CACHE_KEY } });
    if (cached && Date.now() - new Date(cached.computedAt).getTime() < this.POLI_TTL_MS) {
      const rows = (cached.payload as any[]) || [];
      this.poliMem = { ts: Date.now(), rows };
      return rows.slice(0, limit);
    }
    return this.refreshTopPoliticians(limit);
  }

  /** Recompute the leaderboard and persist it (called by getTopPoliticians on a
   *  miss and by the cron so cold user requests stay fast). */
  async refreshTopPoliticians(limit = 60): Promise<any[]> {
    const rows = await this.computeTopPoliticians(Math.max(limit, 100));
    this.poliMem = { ts: Date.now(), rows };
    try {
      await this.kv.save({ key: this.POLI_CACHE_KEY, payload: rows });
    } catch {
      /* cache write best-effort */
    }
    return rows.slice(0, limit);
  }

  private async computeTopPoliticians(limit = 60): Promise<any[]> {
    const roster = await this.getRoster();
    const rows = await this.repo.find();
    interface Acc {
      name: string; chamber: string | null; party: string | null; photoUrl: string | null;
      buyValue: number; sellValue: number; buys: number; sells: number; lastTraded: string;
      byTicker: Map<string, { value: number; company: string }>;
      buyEvents: { ticker: string; ms: number }[];
    }
    const agg = new Map<string, Acc>();
    const mid = (r: any) => {
      const lo = r.amountMin == null ? null : Number(r.amountMin);
      const hi = r.amountMax == null ? null : Number(r.amountMax);
      return lo != null && hi != null ? (lo + hi) / 2 : (hi ?? lo ?? 0);
    };
    for (const t of rows) {
      const key = t.politicianName.trim().toLowerCase();
      const cur: Acc = agg.get(key) || {
        name: t.politicianName.trim(), chamber: t.chamber || null, party: t.party || null,
        photoUrl: t.photoUrl || null, buyValue: 0, sellValue: 0, buys: 0, sells: 0,
        lastTraded: '', byTicker: new Map(), buyEvents: [],
      };
      if (!cur.party && t.party) cur.party = t.party;
      if (!cur.photoUrl && t.photoUrl) cur.photoUrl = t.photoUrl;
      const v = mid(t);
      const d = (t.transactionDate instanceof Date ? t.transactionDate.toISOString() : String(t.transactionDate)).slice(0, 10);
      if (d > cur.lastTraded) cur.lastTraded = d;
      const tk = (t.ticker || '').toUpperCase();
      if (t.action === 'Buy') {
        cur.buys += 1; cur.buyValue += v;
        if (tk) {
          const slot = cur.byTicker.get(tk) || { value: 0, company: t.companyName || tk };
          slot.value += v; cur.byTicker.set(tk, slot);
          const ms = new Date(t.transactionDate).getTime();
          if (Number.isFinite(ms)) cur.buyEvents.push({ ticker: tk, ms });
        }
      } else {
        cur.sells += 1; cur.sellValue += v;
      }
      agg.set(key, cur);
    }

    // Rank by disclosed activity, keep the top N, then score their buys.
    const top = Array.from(agg.values())
      .sort((a, b) => b.buyValue + b.sellValue - (a.buyValue + a.sellValue))
      .slice(0, limit);

    // One close-history fetch per ticker in the top set (cached downstream).
    const tickers = Array.from(new Set(top.flatMap((a) => a.buyEvents.map((e) => e.ticker))));
    const hist = new Map<string, Array<{ t: number; c: number }>>();
    const CONC = 6;
    for (let i = 0; i < tickers.length; i += CONC) {
      const chunk = tickers.slice(i, i + CONC);
      const got = await Promise.all(chunk.map((s) => this.marketStats.getCloseHistory(s, '5y').catch(() => [])));
      got.forEach((h, j) => { if (h.length) hist.set(chunk[j], h); });
    }
    const now = Date.now();

    return top.map((a) => {
      const key = a.name.toLowerCase();
      const parts = key.split(/\s+/);
      const meta = roster.metaByName.get(key) || (parts.length > 1 ? roster.metaByName.get(`${parts[0]} ${parts[parts.length - 1]}`) : undefined);
      const committees =
        roster.committeesByName.get(key) ||
        (parts.length > 1 ? roster.committeesByName.get(`${parts[0]} ${parts[parts.length - 1]}`) : undefined) || [];
      // Profitable buys: a buy is "in the money" if the latest close is above
      // the close on its trade date. Win rate + avg return over scored buys.
      let scored = 0, wins = 0, retSum = 0;
      for (const e of a.buyEvents) {
        const h = hist.get(e.ticker);
        if (!h || !h.length) continue;
        const atBuy = MarketStatsService.closeOn(h, e.ms);
        const nowPx = MarketStatsService.closeOn(h, now);
        if (!atBuy || !nowPx || atBuy <= 0) continue;
        scored += 1;
        // Outlier clamp (QA audit): a bad historical fill (e.g. a split-
        // unadjusted penny price) was producing +13,855% averages. A single
        // disclosed buy is capped at +/-300% for scoring purposes.
        const ret = Math.max(-3, Math.min(3, (nowPx - atBuy) / atBuy));
        retSum += ret;
        if (ret > 0) wins += 1;
      }
      const topHoldings = Array.from(a.byTicker.entries())
        .sort((x, y) => y[1].value - x[1].value)
        .slice(0, 3)
        .map(([ticker, s]) => ({ ticker, company: s.company }));
      return {
        name: a.name,
        party: a.party,
        chamber: meta?.chamber || a.chamber || null,
        state: meta?.state || null,
        committees: committees.slice(0, 3),
        photoUrl: a.photoUrl,
        portfolioValue: Math.round(a.buyValue + a.sellValue),
        buys: a.buys,
        sells: a.sells,
        trades: a.buys + a.sells,
        lastTraded: a.lastTraded || null,
        profitableBuys: wins,
        scoredBuys: scored,
        winRate: scored ? +((wins / scored) * 100).toFixed(1) : null,
        avgReturn: scored ? +((retSum / scored) * 100).toFixed(1) : null,
        topHoldings,
      };
    });
  }

  /** Full profile for one member of Congress (by exact name, case-insensitive)
   *  — powers the politician profile page: headline stats, buy/sell split, most
   *  -traded stocks, and full disclosure history. Dollar figures use the
   *  midpoint of each disclosed amount RANGE (STOCK Act reports bands, not
   *  exact values). */
  /** Names already hydrated with their FULL FMP disclosure history this
   *  process lifetime (per-name, re-checked daily). The latest feeds only
   *  carry ~100 recent rows per chamber; profiles need the whole record so
   *  Trade Volume by Year reaches back a decade and the portfolio estimate
   *  actually has holdings. */
  private readonly hydratedNames = new Map<string, number>();

  private async hydrateFullHistory(name: string): Promise<void> {
    if (!this.fmp.enabled) return;
    const key = name.toLowerCase();
    const last = this.hydratedNames.get(key) || 0;
    if (Date.now() - last < 24 * 60 * 60_000) return;
    this.hydratedNames.set(key, Date.now()); // set first — never hammer FMP on errors
    const trades = await this.fmp.getCongressByName(name);
    if (!trades.length) return;
    const roster = await this.getRoster();
    const dayKey = (d: Date | string | null | undefined) => {
      const dt = d instanceof Date ? d : safeDate(d as any);
      return dt ? dt.toISOString().slice(0, 10) : '';
    };
    const existing = await this.repo.find({
      where: {},
      select: ['politicianName', 'ticker', 'transactionDate', 'action', 'amountMin'],
    });
    const seen = new Set(
      existing.map(
        (e) => `${e.politicianName}|${e.ticker}|${dayKey(e.transactionDate)}|${e.action}|${Number(e.amountMin) || 0}`,
      ),
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
        party:
          t.party ||
          (t.bioguideId && roster.byBioguide.get(t.bioguideId)?.party) ||
          roster.byName.get(t.politicianName.toLowerCase()) ||
          null,
        ticker: t.ticker,
        companyName: t.companyName,
        action: t.action,
        amountMin: t.amountMin,
        amountMax: t.amountMax,
        transactionDate: safeDate(t.transactionDate),
        reportedDate: safeDate(t.reportedDate) ?? safeDate(t.transactionDate),
        source: 'fmp',
      }))
      // Bond/fund disclosures carry no ticker, and the column is NOT NULL —
      // one such row aborts the whole batch insert. This is a stock feed;
      // skip them.
      .filter((r) => r.transactionDate != null && r.ticker);
    if (rows.length) {
      await this.repo.save(rows as any);
      this.logger.log(`Hydrated ${rows.length} historical disclosures for ${name}.`);
    }
  }

  async getPoliticianProfile(name: string) {
    const clean = (name || '').trim();
    if (!clean) return null;
    try {
      await this.hydrateFullHistory(clean);
    } catch (e: any) {
      this.logger.warn(`Full-history hydration failed for ${clean}: ${e?.message || e}`);
    }
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
