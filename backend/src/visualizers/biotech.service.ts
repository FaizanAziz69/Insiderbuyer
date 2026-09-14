import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import {
  VizBiotechCatalyst,
  VizBiotechProfile,
  VizBiotechTrial,
  VizPayloadCache,
} from '../entities/visualizer.entity';
import { FmpService } from '../fmp/fmp.service';
import { UNIVERSE_SCREENER_QUERY } from '../market-stats/market-universe';
import { InsiderSnapshotService } from './insider-snapshot.service';

/**
 * Product 2 — Biotech Bubble Visualizer (Brief v2 §5), Phase 4.
 *
 * Map mode again, biotech vertical: companies anchored to headquarters, sized
 * by market cap, pulsing when a catalyst lands inside ninety days (§5.3).
 *
 * Sources:
 *   roster + fundamentals  FMP (already licensed) — biotech industry screen,
 *                          cash and quarterly burn for the runway figure.
 *   trials                 ClinicalTrials.gov API v2, free and structured.
 *   headquarters           OpenStreetMap Nominatim, geocoded once per city and
 *                          stored, because FMP publishes an address and not a
 *                          coordinate. Rate-limited to one call a second and
 *                          attributed on the panel, per their usage policy.
 *   catalysts              curated table + admin import. §5.4 is explicit that
 *                          no official machine-readable PDUFA feed exists, and
 *                          §12 Q3 (licence a provider vs curate in-house) is
 *                          still open, so nothing is invented here: the store
 *                          is ready and the panel shows what is in it.
 */

const CTGOV = 'https://clinicaltrials.gov/api/v2/studies';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Roster size. Big enough to be the sector, small enough that the nightly
 *  trial refresh stays inside a few minutes of polite API use. */
const ROSTER_MAX = 220;
const MIN_MARKET_CAP = 150_000_000;

export interface BiotechProfileDto {
  ticker: string;
  name: string;
  lat: number | null;
  lng: number | null;
  hqCity: string | null;
  therapeuticArea: string | null;
  leadAsset: string | null;
  mechanism: string | null;
  marketCap: number | null;
  price: number | null;
  cash: number | null;
  quarterlyBurn: number | null;
  runwayQuarters: number | null;
  financialsAsOf: string | null;
  catalysts: {
    id: string;
    eventDate: string;
    isEstimate: boolean;
    type: string;
    description: string;
    drug: string | null;
    indication: string | null;
    daysUntil: number;
    sourceName: string;
    sourceUrl: string | null;
    sourceDate: string;
  }[];
  trials: {
    id: string;
    title: string;
    phase: string | null;
    indication: string | null;
    status: string | null;
    completionDate: string | null;
    enrollment: number | null;
  }[];
  nextCatalystDays: number | null;
  iqs: number | null;
  insidersBuying: boolean;
  /** Totals and the distinct phases, so the map can label and filter without
   *  carrying every trial. Absent on payloads cached before 2026-09-14. */
  trialCount?: number;
  catalystCount?: number;
  phases?: string[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const daysUntil = (iso: string): number =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

@Injectable()
export class BiotechService {
  private readonly logger = new Logger(BiotechService.name);
  private readonly http: AxiosInstance;
  private readonly geo: AxiosInstance;
  private refreshing = false;

  constructor(
    @InjectRepository(VizBiotechProfile)
    private readonly profiles: Repository<VizBiotechProfile>,
    @InjectRepository(VizBiotechTrial)
    private readonly trials: Repository<VizBiotechTrial>,
    @InjectRepository(VizBiotechCatalyst)
    private readonly catalysts: Repository<VizBiotechCatalyst>,
    @InjectRepository(VizPayloadCache)
    private readonly cache: Repository<VizPayloadCache>,
    private readonly fmp: FmpService,
    private readonly insider: InsiderSnapshotService,
  ) {
    this.http = axios.create({ timeout: 30_000, headers: { Accept: 'application/json' } });
    this.geo = axios.create({
      timeout: 20_000,
      headers: {
        Accept: 'application/json',
        // Nominatim requires a real identifying UA; anonymous traffic is blocked.
        'User-Agent': 'InsiderBuying-Visualizers/1.0 (devs@insiderbuying.com)',
      },
    });
  }

  /* -------------------------------------------------------------- read */

  /** How many trials and catalysts the detail panel actually shows. */
  private static readonly DETAIL_ROWS = 6;

  async read(): Promise<{ companies: BiotechProfileDto[]; asOf: string } | { empty: true }> {
    const row = await this.cache.findOne({ where: { key: 'biotech:map' } });
    if (!row?.payload) return { empty: true };
    const full = row.payload as { companies: BiotechProfileDto[]; asOf: string };

    // The map payload was 345 KB, and 73% of it was per-company `trials` and
    // `catalysts` detail that the arena never draws — the panel opens one
    // company at a time and shows six rows of each (George 2026-09-14: the
    // visualizers are slow to load). Ship those six, plus the totals and the
    // distinct phases the label and the phase filter need, and the payload
    // drops to about a quarter of the size. The cached blob is untouched, so
    // this needs no rebuild and nothing is lost.
    const n = BiotechService.DETAIL_ROWS;
    const companies = (full.companies ?? []).map((c) => {
      const trials = c.trials ?? [];
      const catalysts = c.catalysts ?? [];
      return {
        ...c,
        trialCount: trials.length,
        catalystCount: catalysts.length,
        phases: [
          ...new Set(trials.map((t) => t.phase).filter((x): x is string => !!x)),
        ],
        // Catalysts are already ordered soonest-first by the builder, and the
        // panel shows the first six.
        trials: trials.slice(0, n),
        catalysts: catalysts.slice(0, n),
      };
    });
    return { ...full, companies };
  }

  async status(): Promise<Record<string, unknown>> {
    return {
      companies: await this.profiles.count(),
      trials: await this.trials.count(),
      catalysts: await this.catalysts.count(),
      geocoded: await this.profiles
        .createQueryBuilder('p')
        .where('p.lat IS NOT NULL')
        .getCount(),
    };
  }

  /* --------------------------------------------------------- ingestion */

  /** §5.4 roster + fundamentals from FMP, which we already pay for. */
  async refreshRoster(): Promise<{ roster: number }> {
    if (!this.fmp?.enabled) return { roster: 0 };
    // Reuse the site-wide universe query rather than a bespoke one: it is
    // already cached for twelve hours and shared with every other page, and
    // FMP's `industry` filter needs its exact label, which the shared snapshot
    // lets us match in code instead of guessing at.
    const screen = await this.fmp.getScreenerSnapshot(UNIVERSE_SCREENER_QUERY, {
      budgetMs: 120_000,
    });
    const rows = [...screen.values()]
      .filter((r) => /biotech/i.test(r.industry ?? ''))
      .filter((r) => (r.marketCap ?? 0) >= MIN_MARKET_CAP)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, ROSTER_MAX);

    for (const r of rows) {
      const existing = await this.profiles.findOne({ where: { ticker: r.symbol } });
      const row =
        existing ?? this.profiles.create({ ticker: r.symbol, name: r.name ?? r.symbol });
      row.name = r.name ?? row.name;
      row.marketCap = r.marketCap == null ? null : String(r.marketCap);
      await this.profiles.save(row);
    }
    this.logger.log(`biotech roster: ${rows.length}`);
    return { roster: rows.length };
  }

  /** Headquarters coordinates, geocoded once per company and then left alone. */
  async geocodeMissing(limit = 25): Promise<{ geocoded: number }> {
    const pending = await this.profiles
      .createQueryBuilder('p')
      .where('p.lat IS NULL')
      .take(limit)
      .getMany();
    let done = 0;
    for (const p of pending) {
      try {
        const profile = await this.fmp.getCompanyProfile(p.ticker);
        const city = (profile?.city as string) ?? null;
        const state = (profile?.state as string) ?? null;
        const country = (profile?.country as string) ?? null;
        if (!city && !state) {
          // Nothing to geocode; mark the attempt so the queue drains.
          p.hqCity = null;
          p.lat = 0;
          p.lng = 0;
          await this.profiles.save(p);
          continue;
        }
        // City, state, country — the street number defeats a city-level
        // geocode, and a state on its own lands every company in the state's
        // centroid, which is what put Boston's cluster in the wrong place.
        const q = [city, state, country].filter(Boolean).join(', ');
        const { data } = await this.geo.get(NOMINATIM, {
          params: { q, format: 'json', limit: 1 },
        });
        const hit = Array.isArray(data) ? data[0] : null;
        if (hit) {
          p.lat = Number(hit.lat);
          p.lng = Number(hit.lon);
          p.hqCity = [city, state].filter(Boolean).join(', ') || q;
          done++;
        } else {
          p.lat = 0;
          p.lng = 0;
        }
        await this.profiles.save(p);
        // Nominatim's usage policy is one request per second, no exceptions.
        await new Promise((r) => setTimeout(r, 1100));
      } catch (e) {
        this.logger.warn(`geocode ${p.ticker}: ${(e as Error).message}`);
      }
    }
    return { geocoded: done };
  }

  /** Clear a derived field so its refresh step runs again from scratch. Used
   *  when the derivation itself was wrong, not when the data went stale. */
  async reset(what: 'geo' | 'financials'): Promise<{ cleared: number }> {
    const res =
      what === 'geo'
        ? await this.profiles
            .createQueryBuilder()
            .update()
            .set({ lat: null, lng: null, hqCity: null })
            .execute()
        : await this.profiles
            .createQueryBuilder()
            .update()
            .set({ cash: null, quarterlyBurn: null, financialsAsOf: null })
            .execute();
    return { cleared: res.affected ?? 0 };
  }

  /** §5.2 active trials from ClinicalTrials.gov for the roster. */
  async refreshTrials(limit = 30): Promise<{ companies: number; trials: number }> {
    const roster = await this.profiles.find({ take: 400 });
    const stale = roster
      .filter((p) => !!p.name)
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, limit);
    let total = 0;
    for (const p of stale) {
      try {
        const { data } = await this.http.get(CTGOV, {
          params: {
            'query.spons': p.name,
            'filter.overallStatus': 'RECRUITING|ACTIVE_NOT_RECRUITING|ENROLLING_BY_INVITATION',
            pageSize: 12,
            sort: 'LastUpdatePostDate:desc',
          },
        });
        const studies: Record<string, never>[] = data?.studies ?? [];
        const rows = studies
          .map((s) => {
            const ps = (s as Record<string, never>)['protocolSection'] as
              | Record<string, never>
              | undefined;
            if (!ps) return null;
            const ident = ps['identificationModule'] as Record<string, unknown> | undefined;
            const design = ps['designModule'] as Record<string, unknown> | undefined;
            const status = ps['statusModule'] as Record<string, unknown> | undefined;
            const cond = ps['conditionsModule'] as Record<string, unknown> | undefined;
            const nct = String(ident?.nctId ?? '');
            if (!nct) return null;
            const phases = (design?.phases as string[]) ?? [];
            const completion = (status?.primaryCompletionDateStruct as { date?: string })?.date;
            return {
              id: nct,
              ticker: p.ticker,
              title: String(ident?.briefTitle ?? '').slice(0, 400),
              phase: phases.length ? phases.join('/').replace(/PHASE/g, 'Phase ') : null,
              indication: ((cond?.conditions as string[]) ?? []).slice(0, 2).join(', ') || null,
              status: String(status?.overallStatus ?? '') || null,
              completionDate: completion ? normaliseDate(completion) : null,
              enrollment: num((design?.enrollmentInfo as { count?: number })?.count ?? null),
            };
          })
          .filter(Boolean) as VizBiotechTrial[];
        if (rows.length) {
          await this.trials.upsert(rows as never, ['id']);
          total += rows.length;
        }
        // Touch the profile so the round-robin moves on.
        await this.profiles.update({ ticker: p.ticker }, { name: p.name });
      } catch (e) {
        this.logger.warn(`trials ${p.ticker}: ${(e as Error).message}`);
      }
    }
    return { companies: stale.length, trials: total };
  }

  /**
   * §5.2 lists "expected data readouts" alongside PDUFA dates as catalysts,
   * and ClinicalTrials.gov publishes a primary completion date for every
   * registered study — a dated, sourced, genuinely forward-looking event.
   *
   * Those become Readout catalysts, always flagged as estimates, because a
   * primary completion date is the sponsor's own projection and moves. PDUFA
   * and AdCom dates stay curated: they come from FDA correspondence, there is
   * no feed for them, and guessing one would be worse than showing none.
   */
  async deriveReadouts(): Promise<{ derived: number }> {
    const horizon = new Date(Date.now() + 550 * 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.trials.find();
    const out: VizBiotechCatalyst[] = [];
    for (const t of rows) {
      if (!t.completionDate) continue;
      if (t.completionDate < today || t.completionDate > horizon) continue;
      const phase = t.phase ?? '';
      // Phase 1 completions rarely move a stock; 2 and 3 are the events.
      if (!/2|3/.test(phase)) continue;
      out.push(
        this.catalysts.create({
          id: `ctgov-${t.id}`,
          ticker: t.ticker,
          eventDate: t.completionDate,
          isEstimate: true,
          type: 'Readout',
          description: `Primary completion of ${phase}${
            t.indication ? ` trial in ${t.indication}` : ' trial'
          } (${t.id})`,
          drug: null,
          indication: t.indication,
          sourceName: 'ClinicalTrials.gov',
          sourceUrl: `https://clinicaltrials.gov/study/${t.id}`,
          sourceDate: today,
        }),
      );
    }
    // Remove stale derived rows whose trial moved or finished, then re-add.
    await this.catalysts
      .createQueryBuilder()
      .delete()
      .where('id LIKE :p', { p: 'ctgov-%' })
      .execute();
    for (let i = 0; i < out.length; i += 200) {
      await this.catalysts.save(out.slice(i, i + 200));
    }
    return { derived: out.length };
  }

  /** Cash and burn for the §5.2 runway figure. */
  async refreshFinancials(limit = 25): Promise<{ updated: number }> {
    if (!this.fmp?.enabled) return { updated: 0 };
    const roster = await this.profiles.find({ take: 400 });
    const pending = roster
      .filter((p) => p.cash == null && p.financialsAsOf == null)
      .slice(0, limit);
    let n = 0;
    for (const p of pending) {
      try {
        // Read the raw statements rather than getQuarterlyIncomeRows: that
        // helper renames netIncome and, worse, drops any quarter with no
        // revenue — which is most of this sector.
        const statements = await this.fmp.getStatements(p.ticker, 'quarter', 2);
        const bs = statements?.balance?.[0] as Record<string, unknown> | undefined;
        const inc = statements?.income?.[0] as Record<string, unknown> | undefined;
        const cf = statements?.cashflow?.[0] as Record<string, unknown> | undefined;
        const cash =
          num(bs?.cashAndShortTermInvestments) ?? num(bs?.cashAndCashEquivalents) ?? null;
        // Burn is cash out of operations, not accounting loss. Net income
        // reads a milestone payment or a warrant revaluation as if the
        // company had stopped spending — Revolution Medicines showed "not
        // burning" on a quarter it burned nine figures. Net loss stays as the
        // fallback for the rare filer with no cash-flow statement.
        const operating = num(cf?.netCashProvidedByOperatingActivities);
        const netIncome = num(inc?.netIncome);
        const burn =
          operating != null && operating < 0
            ? Math.abs(operating)
            : operating != null && operating >= 0
              ? null
              : netIncome != null && netIncome < 0
                ? Math.abs(netIncome)
                : null;
        p.cash = cash == null ? null : String(cash);
        p.quarterlyBurn = burn == null ? null : String(burn);
        // Stamped even when both are missing, so the queue drains instead of
        // retrying the same empty symbols every night.
        p.financialsAsOf = String(inc?.date ?? bs?.date ?? new Date().toISOString()).slice(0, 10);
        await this.profiles.save(p);
        n++;
      } catch (e) {
        this.logger.warn(`financials ${p.ticker}: ${(e as Error).message}`);
      }
    }
    return { updated: n };
  }

  /** Compose the map payload. Cheap: everything it reads is already stored. */
  async build(): Promise<{ companies: number }> {
    const roster = await this.profiles.find();
    // The field replaced the map, so a company no longer needs coordinates to
    // appear; the headquarters is still shown on its panel where we have it.
    const withHq = roster;
    const tickers = withHq.map((p) => p.ticker);
    const buying = await this.insider.buyingSet(tickers);
    const allTrials = await this.trials.find();
    const trialsBy = new Map<string, VizBiotechTrial[]>();
    for (const t of allTrials) {
      if (!trialsBy.has(t.ticker)) trialsBy.set(t.ticker, []);
      trialsBy.get(t.ticker)!.push(t);
    }
    const allCatalysts = await this.catalysts.find();
    const catBy = new Map<string, VizBiotechCatalyst[]>();
    for (const c of allCatalysts) {
      if (!catBy.has(c.ticker)) catBy.set(c.ticker, []);
      catBy.get(c.ticker)!.push(c);
    }

    const companies: BiotechProfileDto[] = [];
    for (const p of withHq) {
      const cats = (catBy.get(p.ticker) ?? [])
        .map((c) => ({
          id: c.id,
          eventDate: c.eventDate,
          isEstimate: c.isEstimate,
          type: c.type,
          description: c.description,
          drug: c.drug,
          indication: c.indication,
          daysUntil: daysUntil(c.eventDate),
          sourceName: c.sourceName,
          sourceUrl: c.sourceUrl,
          sourceDate: c.sourceDate,
        }))
        .filter((c) => c.daysUntil >= -30)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      const cash = num(p.cash);
      const burn = num(p.quarterlyBurn);
      companies.push({
        ticker: p.ticker,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        hqCity: p.hqCity,
        therapeuticArea: p.therapeuticArea,
        leadAsset: p.leadAsset,
        mechanism: p.mechanism,
        marketCap: num(p.marketCap),
        price: null,
        cash,
        quarterlyBurn: burn,
        runwayQuarters: cash != null && burn != null && burn > 0 ? cash / burn : null,
        financialsAsOf: p.financialsAsOf,
        catalysts: cats,
        trials: (trialsBy.get(p.ticker) ?? []).slice(0, 8).map((t) => ({
          id: t.id,
          title: t.title,
          phase: t.phase,
          indication: t.indication,
          status: t.status,
          completionDate: t.completionDate,
          enrollment: t.enrollment,
        })),
        nextCatalystDays: cats.find((c) => c.daysUntil >= 0)?.daysUntil ?? null,
        iqs: null,
        insidersBuying: buying.has(p.ticker.toUpperCase()),
      });
    }
    companies.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    const payload = { companies, asOf: new Date().toISOString() };
    await this.cache.upsert({ key: 'biotech:map', payload } as never, ['key']);
    return { companies: companies.length };
  }

  /** Nightly: roster, then a slice of geocoding, trials and financials, then
   *  recompose. Slices keep every third-party call inside a polite budget. */
  @Cron('20 8 * * *')
  async refreshAll(): Promise<Record<string, unknown>> {
    if (this.refreshing) return { skipped: 'already running' };
    this.refreshing = true;
    try {
      const roster = await this.refreshRoster();
      const geo = await this.geocodeMissing(40);
      const trials = await this.refreshTrials(40);
      const fin = await this.refreshFinancials(40);
      const readouts = await this.deriveReadouts();
      const built = await this.build();
      return { ...roster, ...geo, ...trials, ...fin, ...readouts, ...built };
    } finally {
      this.refreshing = false;
    }
  }

  /* ------------------------------------------------------- catalysts */

  /** §5.4 / §12 Q3: until a provider is licensed, catalysts are curated. Every
   *  row must carry a source and an as-of date, same rule as mining. */
  async importCatalysts(
    rows: Record<string, unknown>[],
  ): Promise<{ imported: number; rejected: number; issues: string[] }> {
    const issues: string[] = [];
    const ok: VizBiotechCatalyst[] = [];
    rows.forEach((r, i) => {
      const need = ['ticker', 'eventDate', 'type', 'description', 'sourceName', 'sourceDate'];
      const missing = need.filter((f) => !r[f] || String(r[f]).trim() === '');
      if (missing.length) {
        issues.push(`row ${i + 1}: missing ${missing.join(', ')}`);
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.eventDate))) {
        issues.push(`row ${i + 1}: eventDate must be YYYY-MM-DD`);
        return;
      }
      if (!['PDUFA', 'AdCom', 'Readout', 'Other'].includes(String(r.type))) {
        issues.push(`row ${i + 1}: type must be PDUFA, AdCom, Readout or Other`);
        return;
      }
      ok.push(
        this.catalysts.create({
          id: String(r.id ?? `${r.ticker}-${r.eventDate}-${String(r.type).toLowerCase()}`),
          ticker: String(r.ticker).toUpperCase(),
          eventDate: String(r.eventDate),
          isEstimate: r.isEstimate === true || r.isEstimate === 'true',
          type: String(r.type),
          description: String(r.description),
          drug: r.drug ? String(r.drug) : null,
          indication: r.indication ? String(r.indication) : null,
          sourceName: String(r.sourceName),
          sourceUrl: r.sourceUrl ? String(r.sourceUrl) : null,
          sourceDate: String(r.sourceDate),
        }),
      );
    });
    if (ok.length) await this.catalysts.save(ok);
    return { imported: ok.length, rejected: rows.length - ok.length, issues };
  }
}

/** ClinicalTrials.gov dates come as YYYY-MM or YYYY-MM-DD. */
function normaliseDate(d: string): string {
  return /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : d;
}
