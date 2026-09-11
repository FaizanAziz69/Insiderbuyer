import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Company } from '../entities/company.entity';
import {
  VizContractAward,
  VizGovRecipient,
  VizPayloadCache,
} from '../entities/visualizer.entity';
import { CONTRACTORS } from '../gov-contracts/gov-contracts-map';
import { KNOWN_PRIVATE, SUBSIDIARY_TICKER } from './gov-entity-map';
import { FmpService } from '../fmp/fmp.service';
import { InsiderSnapshotService } from './insider-snapshot.service';

/**
 * Product 3 — Government Contracts Visualizer (Brief v2 §6), Phase 2.
 *
 * Free-floating field, one bubble per company, sized by the federal dollars it
 * was awarded inside the selected window, with a Canada / USA / Global switch.
 *
 * Sources, both free and official:
 *   USA    api.usaspending.gov — `spending_by_category/recipient` gives
 *          obligations inside a time period per recipient (the correct figure;
 *          `spending_by_award` returns lifetime award value, which would have
 *          shown Lockheed's 1993 contract as this year's money), and
 *          `spending_by_award` fills the panel's award list.
 *   Canada open.canada.ca proactive disclosure of contracts, read through the
 *          CKAN datastore API newest-first until the window closes. The bulk
 *          CSV is 641 MB and `datastore_search_sql` is disabled on that host,
 *          so paging the sorted index is the only aggregate route available.
 *
 * §6.3 calls entity resolution "the hard problem", and it is: USAspending
 * carries legal entities and UEIs, not tickers, and one company appears under
 * several UEIs (Lockheed Martin twice in the top four). Resolution lives in its
 * own table with three tiers — the site's existing curated contractor map, a
 * conservative name match against our company universe, and manual overrides
 * that no automated pass may overwrite.
 */

const USA = 'https://api.usaspending.gov/api/v2';
const CKAN = 'https://open.canada.ca/data/api/action/datastore_search';
const CA_RESOURCE = 'fac950c0-00d5-4ec1-a4d3-9cbebf98a305';
/** Definitive contracts, purchase orders, delivery orders, BPA calls. */
const AWARD_TYPES = ['A', 'B', 'C', 'D'];
/** Recipients pulled per window. Beyond this the dollars are rounding error. */
const TOP_RECIPIENTS = 300;
/** Hard page bound on the Canadian walk, so one slow week cannot run forever. */
const CA_MAX_PAGES = 260;
const CA_PAGE = 1000;

export type Region = 'us' | 'ca' | 'global';
export type Window = '90d' | '1y';

export interface ContractsBubbleDto {
  id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  isPublic: boolean;
  region: string;
  totalUsd: number;
  priorUsd: number;
  trendPct: number | null;
  topAgency: string | null;
  awardCount: number;
  govRevenueSharePct: number | null;
  marketCap: number | null;
  price: number | null;
  iqs: number | null;
  insidersBuying: boolean;
  /** true = reviewed and confirmed unlisted; false = simply not matched. */
  confirmedPrivate: boolean;
}

export interface CachedPayload {
  region: Region;
  window: Window;
  bubbles: ContractsBubbleDto[];
  totalUsd: number;
  asOf: string;
  fxNote?: string;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Corporate-suffix noise that stops the same company matching itself. */
/** Longest fragment first, so a specific parent beats a general one. */
const SUBSIDIARY_KEYS = Object.keys(SUBSIDIARY_TICKER).sort((a, b) => b.length - a.length);

const SUFFIX_RX =
  /\b(inc|incorporated|corp|corporation|company|co|llc|l\.l\.c|lp|l\.p|llp|plc|ltd|limited|holdings?|group|the|and|&|usa|us|america|american|international|intl|technologies|technology|systems|services|solutions|enterprises|industries)\b/g;

function normalizeName(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/[^A-Z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchKey(raw: string): string {
  return normalizeName(raw).toLowerCase().replace(SUFFIX_RX, ' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class GovVizService {
  private readonly logger = new Logger(GovVizService.name);
  private readonly http: AxiosInstance;
  private refreshing = false;

  constructor(
    @InjectRepository(VizGovRecipient)
    private readonly recipients: Repository<VizGovRecipient>,
    @InjectRepository(VizContractAward)
    private readonly awardsRepo: Repository<VizContractAward>,
    @InjectRepository(VizPayloadCache)
    private readonly cache: Repository<VizPayloadCache>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly insider: InsiderSnapshotService,
  ) {
    this.http = axios.create({
      timeout: 90_000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
  }

  /* -------------------------------------------------------------- read */

  async read(region: Region, window: Window): Promise<CachedPayload | { empty: true }> {
    const row = await this.cache.findOne({ where: { key: `contracts:${region}:${window}` } });
    if (row?.payload) return row.payload as CachedPayload;
    return { empty: true };
  }

  async status(): Promise<Record<string, unknown>> {
    const rows = await this.cache.find();
    const recips = await this.recipients.count();
    const resolved = await this.recipients.count({ where: { resolvedBy: 'manual' } });
    return {
      recipients: recips,
      manualOverrides: resolved,
      payloads: rows
        .filter((r) => r.key.startsWith('contracts:'))
        .map((r) => ({
          key: r.key,
          updatedAt: r.updatedAt,
          bubbles: ((r.payload as CachedPayload)?.bubbles ?? []).length,
        })),
    };
  }

  /* --------------------------------------------------------- ingestion */

  private windowDates(window: Window, back = 0): { start: string; end: string } {
    const days = window === '90d' ? 90 : 365;
    const end = new Date(Date.now() - back * days * 86_400_000);
    const start = new Date(end.getTime() - days * 86_400_000);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    return { start: f(start), end: f(end) };
  }

  /** §6.3 USA ingestion: obligations inside the window, by recipient. */
  private async pullUs(window: Window, back = 0): Promise<Map<string, { name: string; amount: number; uei: string | null }>> {
    const { start, end } = this.windowDates(window, back);
    const out = new Map<string, { name: string; amount: number; uei: string | null }>();
    for (let page = 1; page <= Math.ceil(TOP_RECIPIENTS / 100); page++) {
      const { data } = await this.http.post(`${USA}/search/spending_by_category/recipient/`, {
        filters: {
          time_period: [{ start_date: start, end_date: end }],
          award_type_codes: AWARD_TYPES,
        },
        limit: 100,
        page,
      });
      const results: Record<string, unknown>[] = data?.results ?? [];
      if (results.length === 0) break;
      for (const r of results) {
        const name = String(r.name ?? '').trim();
        if (!name) continue;
        // One legal entity files under several UEIs; the normalised name is
        // the roll-up key, which is exactly what §6.3 asks for.
        const id = normalizeName(name);
        const prev = out.get(id);
        const amount = num(r.amount) ?? 0;
        if (prev) prev.amount += amount;
        else out.set(id, { name, amount, uei: (r.uei as string) ?? null });
      }
      if (!data?.page_metadata?.hasNext) break;
    }
    return out;
  }

  /** §6.3 Canada ingestion: newest-first through the proactive-disclosure
   *  index until the window closes, aggregating by vendor. */
  private async pullCa(window: Window): Promise<Map<string, { name: string; amount: number; uei: null }>> {
    const { start } = this.windowDates(window);
    const out = new Map<string, { name: string; amount: number; uei: null }>();
    let offset = 0;
    let pages = 0;
    let reachedWindow = false;
    while (pages < CA_MAX_PAGES) {
      const { data } = await this.http.get(CKAN, {
        params: {
          resource_id: CA_RESOURCE,
          limit: CA_PAGE,
          offset,
          sort: 'contract_date desc',
          fields: 'vendor_name,contract_date,contract_value,owner_org_title',
        },
      });
      const records: Record<string, unknown>[] = data?.result?.records ?? [];
      if (records.length === 0) break;
      for (const r of records) {
        const date = String(r.contract_date ?? '');
        // Rows dated in the future are data-entry noise; skip rather than
        // let them decide when the walk stops.
        if (date && date <= new Date().toISOString().slice(0, 10)) {
          if (date < start) {
            reachedWindow = true;
            continue;
          }
          const name = String(r.vendor_name ?? '').trim();
          const value = num(r.contract_value) ?? 0;
          if (!name || value <= 0) continue;
          const id = normalizeName(name);
          const prev = out.get(id);
          if (prev) prev.amount += value;
          else out.set(id, { name, amount: value, uei: null });
        }
      }
      // The index is date-sorted, so once a full page sits before the window
      // start there is nothing older worth reading.
      const lastDate = String(records[records.length - 1]?.contract_date ?? '');
      if (reachedWindow && lastDate && lastDate < start) break;
      offset += CA_PAGE;
      pages++;
    }
    this.logger.log(`Canada: ${out.size} vendors from ${pages} pages`);
    return out;
  }

  /* ------------------------------------------------- entity resolution */

  /** Three tiers: the curated contractor map, a conservative name match
   *  against our company universe, then manual overrides which win outright. */
  private async resolve(
    ids: string[],
    names: Map<string, string>,
    region: string,
    ueis: Map<string, string | null>,
  ): Promise<Map<string, VizGovRecipient>> {
    const existing = await this.recipients.find();
    const byId = new Map(existing.map((r) => [r.id, r]));

    const curated = new Map<string, { ticker: string; name: string }>();
    for (const c of CONTRACTORS) curated.set(matchKey(c.recipient), { ticker: c.ticker, name: c.name });

    const universe = await this.companies.find({ select: ['ticker', 'name', 'exchange'] });
    const byMatchKey = new Map<string, { ticker: string; exchange: string | null }>();
    for (const c of universe) {
      if (!c.ticker || !c.name) continue;
      const k = matchKey(c.name);
      if (k.length >= 5 && !byMatchKey.has(k)) {
        byMatchKey.set(k, { ticker: c.ticker.toUpperCase(), exchange: c.exchange ?? null });
      }
    }

    const out = new Map<string, VizGovRecipient>();
    const toSave: VizGovRecipient[] = [];
    for (const id of ids) {
      const display = names.get(id) ?? id;
      const prior = byId.get(id);
      if (prior?.resolvedBy === 'manual') {
        out.set(id, prior);
        continue;
      }
      const key = matchKey(display);
      const upper = normalizeName(display);
      let ticker: string | null = null;
      let exchange: string | null = null;
      let confidence = 0;
      let via = 'none';
      let knownPrivate = false;

      // §6.3 review pass first: the contracting entity is usually a subsidiary
      // whose parent no name match can reach. Longest key wins so
      // "NATIONAL TECHNOLOGY & ENGINEERING SOLUTIONS OF SANDIA" beats nothing
      // and "LOCKHEED MARTIN" never loses to a shorter fragment.
      for (const frag of SUBSIDIARY_KEYS) {
        if (upper.includes(frag)) {
          const t = SUBSIDIARY_TICKER[frag];
          if (t) {
            ticker = t;
            confidence = 0.99;
            via = 'subsidiary';
          } else {
            knownPrivate = true;
            via = 'private';
          }
          break;
        }
      }
      if (!ticker && !knownPrivate) {
        for (const frag of KNOWN_PRIVATE) {
          if (upper.includes(frag)) {
            knownPrivate = true;
            via = 'private';
            break;
          }
        }
      }

      if (!ticker && !knownPrivate) {
        for (const [ck, c] of curated) {
          if (ck && (key === ck || key.startsWith(`${ck} `) || key.includes(ck)) && ck.length >= 4) {
            ticker = c.ticker;
            confidence = 0.95;
            via = 'curated';
            break;
          }
        }
      }
      if (!ticker && !knownPrivate) {
        const hit = byMatchKey.get(key);
        if (hit) {
          ticker = hit.ticker;
          exchange = hit.exchange;
          confidence = 0.8;
          via = 'name';
        }
      }

      const row =
        prior ??
        this.recipients.create({
          id,
          displayName: display,
          region,
          uei: ueis.get(id) ?? null,
        });
      row.displayName = display;
      row.region = region;
      row.ticker = ticker;
      row.exchange = exchange ?? row.exchange ?? null;
      row.uei = ueis.get(id) ?? row.uei ?? null;
      // Three states, not two: listed, confirmed private, and "not matched".
      // §6.1 renders the last two the same way but the panel says which,
      // because they are different claims.
      row.isPublic = !!ticker;
      row.resolvedBy = via === 'none' ? 'auto' : via;
      row.confidence = String(confidence);
      toSave.push(row);
      out.set(id, row);
    }
    for (let i = 0; i < toSave.length; i += 100) {
      await this.recipients.save(toSave.slice(i, i + 100));
    }
    return out;
  }

  /* ------------------------------------------------------------ build */

  /** §11 freshness SLA for contracts is weekly; this runs nightly and is cheap
   *  because everything downstream reads the cached payload. */
  @Cron('40 7 * * *')
  async refreshAll(): Promise<Record<string, unknown>> {
    if (this.refreshing) return { skipped: 'already running' };
    this.refreshing = true;
    const summary: Record<string, unknown> = {};
    try {
      for (const window of ['90d', '1y'] as Window[]) {
        summary[`us:${window}`] = await this.build('us', window);
      }
      for (const window of ['90d', '1y'] as Window[]) {
        summary[`ca:${window}`] = await this.build('ca', window);
      }
      for (const window of ['90d', '1y'] as Window[]) {
        summary[`global:${window}`] = await this.buildGlobal(window);
      }
    } catch (e) {
      this.logger.error(`refresh failed: ${(e as Error).message}`);
      summary.error = (e as Error).message;
    } finally {
      this.refreshing = false;
    }
    return summary;
  }

  async build(region: 'us' | 'ca', window: Window): Promise<{ bubbles: number }> {
    const current = region === 'us' ? await this.pullUs(window) : await this.pullCa(window);
    const prior = region === 'us' ? await this.pullUs(window, 1) : new Map();

    const ids = [...current.keys()];
    const names = new Map([...current].map(([id, v]) => [id, v.name]));
    const ueis = new Map([...current].map(([id, v]) => [id, v.uei]));
    const resolved = await this.resolve(ids, names, region, ueis);

    const tickers = [...resolved.values()].map((r) => r.ticker).filter(Boolean) as string[];
    const quotes = this.fmp?.enabled
      ? await this.fmp.getQuotesBatch(tickers).catch(() => new Map())
      : new Map();
    const buying = await this.insider.buyingSet(tickers);

    const iqsByTicker = new Map<string, number>();
    for (const t of tickers.slice(0, 120)) {
      const snap = await this.insider.get(t);
      if (snap.iqsScore != null) iqsByTicker.set(t, snap.iqsScore);
    }

    // §6.2 government-revenue concentration, "where derivable": window dollars
    // over trailing-twelve-month revenue. Bounded to the largest recipients
    // because each one costs an income-statement call.
    const bigResolved = [...current.entries()]
      .filter(([id]) => resolved.get(id)?.ticker)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 80);
    const govShare = new Map<string, number>();
    for (const [id, v] of bigResolved) {
      const t = resolved.get(id)!.ticker!;
      const share = await this.govRevenueShare(t, v.amount);
      if (share != null) govShare.set(id, share);
    }

    const bubbles: ContractsBubbleDto[] = [];
    for (const [id, v] of current) {
      const r = resolved.get(id);
      const priorAmount = prior.get(id)?.amount ?? 0;
      const ticker = r?.ticker ?? null;
      const q = ticker ? quotes.get(ticker) : null;
      bubbles.push({
        id,
        name: v.name,
        ticker,
        exchange: r?.exchange ?? null,
        isPublic: !!ticker,
        region,
        totalUsd: Math.round(v.amount),
        priorUsd: Math.round(priorAmount),
        trendPct:
          priorAmount > 0 ? ((v.amount - priorAmount) / priorAmount) * 100 : null,
        topAgency: null,
        awardCount: 0,
        govRevenueSharePct: govShare.get(id) ?? null,
        marketCap: num(q?.marketCap),
        price: num(q?.price),
        iqs: ticker ? iqsByTicker.get(ticker) ?? null : null,
        insidersBuying: ticker ? buying.has(ticker) : false,
        confirmedPrivate: r?.resolvedBy === 'private',
      });
    }
    bubbles.sort((a, b) => b.totalUsd - a.totalUsd);

    const payload: CachedPayload = {
      region,
      window,
      bubbles,
      totalUsd: bubbles.reduce((s, b) => s + b.totalUsd, 0),
      asOf: new Date().toISOString(),
      fxNote:
        region === 'ca'
          ? 'Canadian contract values are published in Canadian dollars and are shown unconverted.'
          : undefined,
    };
    await this.cache.upsert(
      { key: `contracts:${region}:${window}`, payload } as never,
      ['key'],
    );
    return { bubbles: bubbles.length };
  }

  /** §6.1 Global at launch = USA + Canada, merged on the resolution key. */
  private async buildGlobal(window: Window): Promise<{ bubbles: number }> {
    const us = (await this.read('us', window)) as CachedPayload;
    const ca = (await this.read('ca', window)) as CachedPayload;
    const merged = new Map<string, ContractsBubbleDto>();
    for (const b of [...(us?.bubbles ?? []), ...(ca?.bubbles ?? [])]) {
      const prev = merged.get(b.id);
      if (prev) {
        prev.totalUsd += b.totalUsd;
        prev.priorUsd += b.priorUsd;
        prev.region = 'global';
        prev.trendPct =
          prev.priorUsd > 0 ? ((prev.totalUsd - prev.priorUsd) / prev.priorUsd) * 100 : null;
      } else {
        merged.set(b.id, { ...b, region: 'global' });
      }
    }
    const bubbles = [...merged.values()].sort((a, b) => b.totalUsd - a.totalUsd);
    const payload: CachedPayload = {
      region: 'global',
      window,
      bubbles,
      totalUsd: bubbles.reduce((s, b) => s + b.totalUsd, 0),
      asOf: new Date().toISOString(),
      fxNote:
        'Global merges US federal obligations (USD) with Canadian contract values (CAD), unconverted.',
    };
    await this.cache.upsert({ key: `contracts:global:${window}`, payload } as never, ['key']);
    return { bubbles: bubbles.length };
  }

  /* ------------------------------------------------------------ awards */

  /** §6.2 the panel's award list, fetched on demand and kept. */
  async awards(recipientId: string, window: Window = '1y'): Promise<VizContractAward[]> {
    const cached = await this.awardsRepo.find({
      where: { recipientId },
      order: { awardDate: 'DESC' },
      take: 12,
    });
    const fresh =
      cached.length > 0 &&
      Date.now() - new Date(cached[0].updatedAt).getTime() < 24 * 3_600_000;
    if (fresh) return cached;

    const row = await this.recipients.findOne({ where: { id: recipientId } });
    if (!row) return cached;

    if (row.region === 'ca') return this.awardsCa(row, window);
    return this.awardsUs(row, window);
  }

  private async awardsUs(row: VizGovRecipient, window: Window): Promise<VizContractAward[]> {
    const { start, end } = this.windowDates(window);
    try {
      const { data } = await this.http.post(`${USA}/search/spending_by_award/`, {
        filters: {
          time_period: [{ start_date: start, end_date: end }],
          award_type_codes: AWARD_TYPES,
          recipient_search_text: [row.displayName],
        },
        fields: [
          'Award ID',
          'Recipient Name',
          'Awarding Agency',
          'Award Amount',
          'Start Date',
          'End Date',
          'Description',
          'Contract Award Type',
        ],
        sort: 'Award Amount',
        order: 'desc',
        limit: 12,
        page: 1,
        subawards: false,
      });
      const rows: VizContractAward[] = (data?.results ?? []).map((r: Record<string, unknown>) => ({
        id: `us:${String(r['Award ID'] ?? Math.random())}`,
        recipientId: row.id,
        region: 'us',
        agency: (r['Awarding Agency'] as string) ?? null,
        awardDate: (r['Start Date'] as string) ?? null,
        amountUsd: String(num(r['Award Amount']) ?? 0),
        description: (r['Description'] as string) ?? null,
        vehicle: (r['Contract Award Type'] as string) ?? null,
        popStart: (r['Start Date'] as string) ?? null,
        popEnd: (r['End Date'] as string) ?? null,
      })) as never;
      if (rows.length) await this.awardsRepo.upsert(rows as never, ['id']);
      return rows;
    } catch (e) {
      this.logger.warn(`awards ${row.id}: ${(e as Error).message}`);
      return [];
    }
  }

  private async awardsCa(row: VizGovRecipient, window: Window): Promise<VizContractAward[]> {
    const { start } = this.windowDates(window);
    try {
      const { data } = await this.http.get(CKAN, {
        params: {
          resource_id: CA_RESOURCE,
          limit: 40,
          sort: 'contract_date desc',
          q: row.displayName,
          fields:
            'reference_number,vendor_name,contract_date,contract_value,owner_org_title,description_en,contract_period_start,delivery_date',
        },
      });
      const records: Record<string, unknown>[] = data?.result?.records ?? [];
      const rows = records
        .filter((r) => normalizeName(String(r.vendor_name ?? '')) === row.id)
        .filter((r) => String(r.contract_date ?? '') >= start)
        .slice(0, 12)
        .map((r) => ({
          id: `ca:${String(r.reference_number ?? Math.random())}`,
          recipientId: row.id,
          region: 'ca',
          agency: (r.owner_org_title as string)?.split('|')[0]?.trim() ?? null,
          awardDate: (r.contract_date as string) ?? null,
          amountUsd: String(num(r.contract_value) ?? 0),
          description: (r.description_en as string) ?? null,
          vehicle: null,
          popStart: (r.contract_period_start as string) ?? null,
          popEnd: (r.delivery_date as string) ?? null,
        }));
      if (rows.length) await this.awardsRepo.upsert(rows as never, ['id']);
      return rows as never;
    } catch (e) {
      this.logger.warn(`awards ca ${row.id}: ${(e as Error).message}`);
      return [];
    }
  }

  /** §6.2 government-revenue concentration, where it is derivable. */
  async govRevenueShare(ticker: string, windowUsd: number): Promise<number | null> {
    if (!ticker || !this.fmp?.enabled || windowUsd <= 0) return null;
    try {
      const inc = await this.fmp.getIncomeStatementTtm(ticker);
      const revenue = num(inc?.revenue);
      if (!revenue || revenue <= 0) return null;
      return Math.min(100, (windowUsd / revenue) * 100);
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------- admin */

  async listRecipients(limit = 300): Promise<VizGovRecipient[]> {
    return this.recipients.find({ order: { displayName: 'ASC' }, take: limit });
  }

  /** §6.3 the manual override pass. Anything set here is never re-guessed. */
  async setRecipient(
    id: string,
    patch: { ticker?: string | null; exchange?: string | null; isPublic?: boolean },
  ): Promise<VizGovRecipient | null> {
    const row = await this.recipients.findOne({ where: { id } });
    if (!row) return null;
    if (patch.ticker !== undefined) row.ticker = patch.ticker ? patch.ticker.toUpperCase() : null;
    if (patch.exchange !== undefined) row.exchange = patch.exchange;
    row.isPublic = patch.isPublic ?? !!row.ticker;
    row.resolvedBy = 'manual';
    row.confidence = '1';
    await this.recipients.save(row);
    return row;
  }
}
