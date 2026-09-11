import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import {
  VizCuratedMarket,
  VizMarketContract,
} from '../entities/visualizer.entity';
import {
  KalshiClient,
  kalshiCategory,
  kalshiDollarVolume,
  type KalshiMarket,
} from './kalshi.source';
import { RealtimeService } from './realtime.service';

/**
 * Product 4 — Prediction Market Bubbles (Brief v2 §7), the Phase-1 ship.
 *
 * Everything here is Polymarket's free public surface, per §12 Q5 ("Polymarket
 * first, Kalshi fast-follow"):
 *   Gamma  https://gamma-api.polymarket.com  — market + event metadata, prices,
 *          volumes, best bid/ask. Polled; no key.
 *   CLOB   https://clob.polymarket.com       — price history for the sparkline.
 *   Data   https://data-api.polymarket.com   — recent trades for the live feed.
 *
 * §7.2's architecture rule is enforced here: the browser never talks to those
 * hosts. This service polls, normalises into MarketContract (§7.3), keeps the
 * ring buffers, and hands deltas to RealtimeService. The client sees one
 * schema and one origin.
 *
 * Kalshi slots in as a second `source` against the same tables — the poller is
 * the only piece that would be duplicated.
 */

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';
const DATA = 'https://data-api.polymarket.com';

/** How many curated markets the field holds. §9.2: O(n²) collisions are fine
 *  to ~150 bubbles, and §7.2 asks for an allowlist of 50–150. */
const MAX_MARKETS = 150;
/** §7.2 minimum-volume threshold — below this a market is too thin to show. */
const MIN_VOLUME_24H = 5_000;
const MIN_VOLUME_TOTAL = 50_000;
/** 24h volume must be at least this share of lifetime volume — see isTradeable. */
const LIVE_SHARE_MIN = 0.005;
/** At most two markets from one event, so a 128-outcome event cannot flood. */
const MAX_PER_EVENT = 2;
/**
 * Slots held for Kalshi. Ranking both venues on one dollar scale sounds fair
 * and produces a board with no Kalshi on it at all: Polymarket reports dollars
 * while Kalshi reports contracts, and Kalshi is the smaller venue besides, so
 * its best market loses to Polymarket's hundredth. George asked for both
 * venues, so the second one gets a floor.
 */
const KALSHI_SLOTS = 35;
/**
 * Per-category ceilings. §7.2 makes curation quality the differentiator, and
 * raw 24h volume alone hands roughly a third of the field to single tennis and
 * esports matches — true, but not what a finance audience opened the page for.
 * The caps keep Politics/Economy/Crypto in front while Sports still gets a
 * real presence, and volume still orders everything inside a category.
 */
const CATEGORY_CAPS: Record<string, number> = {
  Politics: 45,
  Economy: 35,
  Crypto: 30,
  Sports: 25,
  'Tech & Science': 20,
  Other: 15,
};

const POLL_MS = 15_000;
const CATALOG_MS = 30 * 60_000;
const HISTORY_CAP = 500;
const TRADES_CAP = 50;

export const CATEGORIES = [
  'Politics',
  'Economy',
  'Crypto',
  'Sports',
  'Tech & Science',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Tag → category. First hit in this order wins, so "Crypto + Politics" on an
 *  election-priced bitcoin market lands in Crypto where a reader expects it. */
const TAG_MAP: [Category, RegExp][] = [
  ['Crypto', /\b(crypto|bitcoin|btc|ethereum|eth|solana|memecoin|defi|stablecoin|xrp|dogecoin)\b/i],
  ['Sports', /\b(sports?|nfl|nba|mlb|nhl|soccer|football|tennis|golf|f1|formula|olympics|ufc|boxing|cricket|games|epl|la liga|champions league|esports|csgo|counter-strike|league of legends|dota)\b/i],
  ['Tech & Science', /\b(tech|ai|artificial intelligence|openai|science|space|spacex|nasa|climate|health|nobel|chips?)\b/i],
  ['Economy', /\b(econom|fed|fomc|inflation|cpi|jobs|gdp|rates?|recession|earnings|stocks?|markets?|oil|tariff)\b/i],
  ['Politics', /\b(politic|election|president|senate|house|congress|trump|biden|geopolit|war|ukraine|israel|nato|government|shutdown|supreme court|cabinet|governor|primary|nominee)\b/i],
];

interface GammaMarket {
  id: string;
  question: string;
  slug?: string;
  conditionId?: string;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  volumeNum?: number;
  volume24hr?: number;
  liquidityNum?: number;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  groupItemTitle?: string;
  icon?: string;
  image?: string;
  description?: string;
  closed?: boolean;
  active?: boolean;
  archived?: boolean;
  acceptingOrders?: boolean;
}

interface GammaEvent {
  id: string;
  title: string;
  slug?: string;
  volume24hr?: number;
  tags?: { label?: string }[];
  markets?: GammaMarket[];
}

/** The normalised row the API and the bubble field speak (§7.3). */
export interface MarketContractDto {
  id: string;
  source: string;
  sourceId: string;
  question: string;
  shortLabel: string;
  category: string;
  endDate: string | null;
  status: string;
  yesPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  volumeTotal: number;
  volume24h: number;
  openInterest: number | null;
  oneDayChange: number | null;
  slug: string | null;
  iconUrl: string | null;
  updatedAt: number;
}

interface LiveState extends MarketContractDto {
  history: { t: number; p: number }[];
  trades: { side: string; sizeUsd: number; price: number; ts: number; outcome: string }[];
  dirty: boolean;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** JSON-encoded array fields on Gamma come back as strings. */
function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v !== 'string') return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

@Injectable()
export class PredictionService implements OnModuleInit {
  private readonly logger = new Logger(PredictionService.name);
  private readonly http: AxiosInstance;
  /** id → latest normalised state. The bubble field's source of truth. */
  private readonly live = new Map<string, LiveState>();
  private lastCatalog = 0;
  private lastPoll = 0;
  private polling = false;
  private readonly tradeCache = new Map<string, { at: number; rows: LiveState['trades'] }>();
  private readonly historyCache = new Map<string, { at: number; rows: { t: number; p: number }[] }>();
  private readonly kalshi: KalshiClient;

  constructor(
    @InjectRepository(VizCuratedMarket)
    private readonly curated: Repository<VizCuratedMarket>,
    @InjectRepository(VizMarketContract)
    private readonly markets: Repository<VizMarketContract>,
    private readonly realtime: RealtimeService,
  ) {
    this.kalshi = new KalshiClient();
    this.http = axios.create({
      timeout: 20_000,
      headers: { Accept: 'application/json', 'User-Agent': 'InsiderBuying-Visualizers/1.0' },
    });
  }

  async onModuleInit(): Promise<void> {
    // Warm from the last known rows so a restart paints instantly instead of
    // waiting a poll cycle (§9.4 AC: cold load < 2s to moving bubbles).
    try {
      const rows = await this.markets.find();
      for (const r of rows) this.live.set(r.id, this.fromRow(r));
      this.logger.log(`warm start: ${rows.length} markets`);
    } catch (e) {
      this.logger.warn(`warm start skipped: ${(e as Error).message}`);
    }
    const tick = setInterval(() => {
      void this.poll();
    }, POLL_MS);
    tick.unref?.();
    // Kick off out of band; a slow venue must never delay app boot.
    setTimeout(() => void this.refreshCatalog().then(() => this.poll()), 4_000).unref?.();
  }

  /* ------------------------------------------------------------ catalog */

  /** §7.2 curation layer. Editor rows are authoritative; the ranker only fills
   *  the remaining slots with the highest-volume live markets. */
  @Cron('7 */6 * * *')
  async refreshCatalog(): Promise<{ curated: number; added: number; retired: number }> {
    const editor = await this.curated.find({ where: { curatedBy: 'editor' } });
    const keep = new Map(editor.map((r) => [r.id, r]));

    let events: GammaEvent[] = [];
    for (let offset = 0; offset < 400 && events.length < 400; offset += 100) {
      const { data } = await this.http.get<GammaEvent[]>(`${GAMMA}/events`, {
        // Each page carries every market of every event — 10-15 MB — so the
        // default 20s client timeout is not enough on a cold connection.
        timeout: 90_000,
        params: {
          limit: 100,
          offset,
          closed: false,
          active: true,
          archived: false,
          order: 'volume24hr',
          ascending: false,
        },
      });
      if (!Array.isArray(data) || data.length === 0) break;
      events = events.concat(data);
    }

    const ranked: {
      m: GammaMarket & { conditionId?: string };
      category: Category;
      label: string;
      v24: number;
      source?: string;
    }[] = [];
    for (const ev of events) {
      const category = this.categorise(ev);
      const eligible = (ev.markets ?? [])
        .filter((m) => this.isTradeable(m))
        .sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0))
        .slice(0, MAX_PER_EVENT);
      for (const m of eligible) {
        ranked.push({
          m,
          category,
          label: this.shortLabel(ev, m),
          v24: m.volume24hr ?? 0,
        });
      }
    }
    // Kalshi, the second venue (§12 Q5). Same shape, same ranking, same caps,
    // so the two sources compete for slots on the merits rather than one
    // getting a reserved quota.
    try {
      const kevents = await this.kalshi.events(4);
      for (const ev of kevents) {
        const category = kalshiCategory(ev.category);
        const eligible = (ev.markets ?? [])
          .filter((m) => this.kalshiTradeable(m))
          .sort(
            (a, b) =>
              kalshiDollarVolume(b, Number(b.volume_24h_fp ?? 0)) -
              kalshiDollarVolume(a, Number(a.volume_24h_fp ?? 0)),
          )
          .slice(0, MAX_PER_EVENT);
        for (const m of eligible) {
          ranked.push({
            m: {
              id: m.ticker,
              question: m.title ?? ev.title ?? m.ticker,
              groupItemTitle: m.yes_sub_title ?? m.subtitle,
              conditionId: ev.series_ticker ?? ev.event_ticker.split('-')[0],
            } as GammaMarket & { conditionId: string },
            category,
            label: this.kalshiLabel(ev, m),
            v24: kalshiDollarVolume(m, Number(m.volume_24h_fp ?? 0)),
            source: 'kalshi',
          });
        }
      }
    } catch (e) {
      // A venue being down must not stop the other one from being curated.
      this.logger.warn(`kalshi catalog: ${(e as Error).message}`);
    }

    ranked.sort((a, b) => b.v24 - a.v24);
    // Kalshi's floor is taken first, then the merged ranking fills the rest.
    const kalshiFirst = ranked.filter((r) => r.source === 'kalshi').slice(0, KALSHI_SLOTS);
    const rest = ranked.filter((r) => !kalshiFirst.includes(r));
    const ordered = [...kalshiFirst, ...rest];

    let added = 0;
    const used: Record<string, number> = {};
    for (const [, row] of keep) used[row.category] = (used[row.category] ?? 0) + 1;
    for (const r of ordered) {
      if (keep.size >= MAX_MARKETS) break;
      const source = r.source ?? 'polymarket';
      const id = `${source}:${r.m.id}`;
      if (keep.has(id)) continue;
      const cap = CATEGORY_CAPS[r.category] ?? MAX_MARKETS;
      if ((used[r.category] ?? 0) >= cap) continue;
      used[r.category] = (used[r.category] ?? 0) + 1;
      const row = this.curated.create({
        id,
        source,
        sourceId: r.m.id,
        shortLabel: r.label,
        category: r.category,
        active: true,
        minVolume: String(MIN_VOLUME_24H),
        sortOrder: 0,
        curatedBy: 'auto',
      });
      keep.set(id, row);
      added++;
    }

    await this.curated.upsert([...keep.values()], ['id']);
    // Retire auto rows that fell out of the ranking; editor rows never expire.
    const stale = await this.curated
      .createQueryBuilder()
      .delete()
      // TypeORM keeps camelCase column names here, so the raw predicate must
      // quote it — `curated_by` does not exist and the delete throws.
      .where('"curatedBy" = :b', { b: 'auto' })
      .andWhere('id NOT IN (:...ids)', { ids: [...keep.keys()] })
      .execute();

    this.lastCatalog = Date.now();
    this.logger.log(
      `catalog: ${keep.size} curated (${added} new, ${stale.affected ?? 0} retired) from ${events.length} events`,
    );
    return { curated: keep.size, added, retired: stale.affected ?? 0 };
  }

  private isTradeable(m: GammaMarket): boolean {
    if (m.closed || m.archived || m.active === false) return false;
    if (m.acceptingOrders === false) return false;
    if ((m.volume24hr ?? 0) < MIN_VOLUME_24H) return false;
    if ((m.volumeNum ?? 0) < MIN_VOLUME_TOTAL) return false;
    // Parked novelty markets ("Will Jesus Christ return before 2027") carry
    // enormous lifetime volume and almost no trading, which makes them the
    // biggest bubble on a board about live money. Require the last day to be a
    // real fraction of the lifetime before a market earns a slot.
    if ((m.volume24hr ?? 0) < (m.volumeNum ?? 0) * LIVE_SHARE_MIN) return false;
    const prices = parseJsonArray(m.outcomePrices).map(Number);
    if (prices.length < 2) return false;
    // A market pinned at 0/1 has already resolved in all but name.
    const yes = prices[0];
    return yes > 0.005 && yes < 0.995;
  }

  /** Kalshi's own tradeability gate: real volume, a live price, not resolved. */
  private kalshiTradeable(m: KalshiMarket): boolean {
    if ((m.status ?? '') !== 'active') return false;
    const contracts24 = Number(m.volume_24h_fp ?? 0);
    const contracts = Number(m.volume_fp ?? 0);
    if (!(contracts24 > 0) || !(contracts > 0)) return false;
    const dollars24 = kalshiDollarVolume(m, contracts24);
    const dollarsTotal = kalshiDollarVolume(m, contracts);
    if (dollars24 < MIN_VOLUME_24H / 5) return false;
    if (dollarsTotal < MIN_VOLUME_TOTAL / 5) return false;
    const price = Number(m.last_price_dollars ?? 0);
    return price > 0.005 && price < 0.995;
  }

  private kalshiLabel(
    ev: { title?: string; markets?: unknown[] },
    m: KalshiMarket,
  ): string {
    const outcome = m.yes_sub_title ?? m.subtitle ?? '';
    if ((ev.markets?.length ?? 0) > 1 && outcome) {
      return `${this.stem(ev.title ?? '')}: ${this.trim(outcome, 20)}`;
    }
    return this.trim(m.title ?? ev.title ?? m.ticker, 42);
  }

  private categorise(ev: GammaEvent): Category {
    const hay = [
      ...(ev.tags ?? []).map((t) => t.label ?? ''),
      ev.title ?? '',
    ].join(' ');
    for (const [cat, rx] of TAG_MAP) if (rx.test(hay)) return cat;
    return 'Other';
  }

  /** §7.2 "short display labels" — the venue's question is far too long to sit
   *  inside a bubble, so we build our own and keep the full question for the
   *  panel header. */
  private shortLabel(ev: GammaEvent, m: GammaMarket): string {
    const multi = (ev.markets?.length ?? 0) > 1 && !!m.groupItemTitle;
    if (multi) return `${this.stem(ev.title)}: ${this.trim(m.groupItemTitle!, 20)}`;
    // Single-outcome questions read best verbatim — dropping the leading
    // "Will" saves four characters and costs the sentence its grammar.
    return this.trim(m.question, 42);
  }

  /** The event title as a bubble prefix: no trailing month, year or bracket,
   *  because the outcome half of the label carries the specifics. */
  private stem(title: string): string {
    const t = (title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\?+$/, '')
      .replace(
        /\s+(in|by|before|on)\s+(January|February|March|April|May|June|July|August|September|October|November|December)(\s+\d{4})?$/i,
        '',
      )
      .replace(/\s+\d{4}$/, '')
      .replace(/\s*\(.*?\)\s*$/, '');
    return this.trim(t, 26);
  }

  private trim(s: string, max: number): string {
    const t = (s || '').replace(/\s+/g, ' ').trim().replace(/\?+$/, '');
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return `${(sp > max * 0.55 ? cut.slice(0, sp) : cut).trim()}…`;
  }

  /* --------------------------------------------------------------- poll */

  /** One poll cycle: refresh every curated market and publish what moved. */
  async poll(): Promise<{ polled: number; changed: number }> {
    if (this.polling) return { polled: 0, changed: 0 };
    this.polling = true;
    try {
      const curated = await this.curated.find({ where: { active: true } });
      if (curated.length === 0) return { polled: 0, changed: 0 };
      const byId = new Map(curated.map((c) => [c.sourceId, c]));
      const ids = curated.filter((c) => c.source === 'polymarket').map((c) => c.sourceId);
      const fetched: GammaMarket[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const slice = ids.slice(i, i + 50);
        const qs = new URLSearchParams();
        for (const id of slice) qs.append('id', id);
        // Gamma pages at 20 by default even when the query names 50 ids, which
        // silently capped the board at 60 markets. The limit must be explicit.
        qs.append('limit', String(slice.length));
        const { data } = await this.http.get<GammaMarket[]>(`${GAMMA}/markets?${qs}`);
        if (Array.isArray(data)) fetched.push(...data);
      }

      // Kalshi rows refresh through their own endpoint and are mapped onto the
      // same Gamma-shaped record, so everything below this line is source-blind.
      const kalshiTickers = curated.filter((c) => c.source === 'kalshi').map((c) => c.sourceId);
      if (kalshiTickers.length) {
        try {
          const kms = await this.kalshi.markets(kalshiTickers);
          for (const km of kms) {
            const contracts = Number(km.volume_fp ?? 0);
            const contracts24 = Number(km.volume_24h_fp ?? 0);
            const last = Number(km.last_price_dollars ?? 0);
            const prev = Number(km.previous_price_dollars ?? 0);
            fetched.push({
              id: km.ticker,
              question: km.title ?? km.ticker,
              slug: km.ticker,
              endDate: km.close_time,
              outcomePrices: JSON.stringify([String(last), String(1 - last)]),
              volumeNum: kalshiDollarVolume(km, contracts),
              volume24hr: kalshiDollarVolume(km, contracts24),
              liquidityNum: Number(km.open_interest_fp ?? 0),
              bestBid: Number(km.yes_bid_dollars ?? 0) || undefined,
              bestAsk: Number(km.yes_ask_dollars ?? 0) || undefined,
              lastTradePrice: last,
              oneDayPriceChange: prev > 0 ? last - prev : undefined,
              closed: (km.status ?? '') !== 'active',
            } as GammaMarket);
          }
        } catch (e) {
          this.logger.warn(`kalshi poll: ${(e as Error).message}`);
        }
      }

      const now = Date.now();
      let changed = 0;
      const seen = new Set<string>();
      for (const m of fetched) {
        const c = byId.get(m.id);
        if (!c) continue;
        const id = c.id;
        seen.add(id);
        const prices = parseJsonArray(m.outcomePrices).map(Number);
        const yes = Number.isFinite(prices[0]) ? prices[0] : num(m.lastTradePrice);
        const prev = this.live.get(id);
        const next: LiveState = {
          id,
          source: c.source,
          sourceId: c.sourceId,
          question: m.question ?? prev?.question ?? c.shortLabel,
          shortLabel: c.shortLabel,
          category: c.category,
          endDate: m.endDate ?? prev?.endDate ?? null,
          status: m.closed ? 'closed' : 'open',
          yesPrice: yes,
          bestBid: num(m.bestBid),
          bestAsk: num(m.bestAsk),
          volumeTotal: num(m.volumeNum) ?? prev?.volumeTotal ?? 0,
          volume24h: num(m.volume24hr) ?? prev?.volume24h ?? 0,
          // Polymarket exposes book depth, not open interest; liquidity is the
          // honest stand-in and the panel labels it as such.
          openInterest: num(m.liquidityNum),
          oneDayChange: num(m.oneDayPriceChange),
          slug: m.slug ?? prev?.slug ?? null,
          iconUrl: m.icon ?? m.image ?? prev?.iconUrl ?? null,
          updatedAt: now,
          history: prev?.history ?? [],
          trades: prev?.trades ?? [],
          dirty: true,
        };
        const moved =
          !prev ||
          prev.yesPrice !== next.yesPrice ||
          prev.bestBid !== next.bestBid ||
          prev.bestAsk !== next.bestAsk ||
          prev.volume24h !== next.volume24h;
        if (next.yesPrice != null) {
          const last = next.history[next.history.length - 1];
          if (!last || last.p !== next.yesPrice) {
            next.history = [...next.history, { t: Math.floor(now / 1000), p: next.yesPrice }];
            if (next.history.length > HISTORY_CAP) next.history = next.history.slice(-HISTORY_CAP);
          }
        }
        this.live.set(id, next);
        if (moved) {
          changed++;
          this.realtime.publish('markets', id, {
            id,
            yesPrice: next.yesPrice,
            bestBid: next.bestBid,
            bestAsk: next.bestAsk,
            volumeTotal: next.volumeTotal,
            volume24h: next.volume24h,
            openInterest: next.openInterest,
            oneDayChange: next.oneDayChange,
            status: next.status,
            dir: prev?.yesPrice != null && next.yesPrice != null
              ? Math.sign(next.yesPrice - prev.yesPrice)
              : 0,
            ts: now,
          });
        }
      }
      // A curated market Gamma no longer returns has resolved or been pulled.
      for (const id of [...this.live.keys()]) {
        if (!byId.has(this.live.get(id)!.sourceId)) this.live.delete(id);
        else if (!seen.has(id)) {
          const s = this.live.get(id)!;
          if (s.status !== 'closed') {
            s.status = 'closed';
            s.dirty = true;
            this.realtime.publish('markets', id, { id, status: 'closed', ts: now });
          }
        }
      }
      this.lastPoll = now;
      return { polled: fetched.length, changed };
    } catch (e) {
      this.logger.warn(`poll failed: ${(e as Error).message}`);
      return { polled: 0, changed: 0 };
    } finally {
      this.polling = false;
    }
  }

  /** Flush the in-memory ring buffers to Postgres so a restart keeps them. */
  @Cron('*/2 * * * *')
  async flush(): Promise<number> {
    const dirty = [...this.live.values()].filter((s) => s.dirty);
    if (dirty.length === 0) return 0;
    const rows = dirty.map((s) => ({
      id: s.id,
      source: s.source,
      sourceId: s.sourceId,
      question: s.question,
      shortLabel: s.shortLabel,
      category: s.category,
      endDate: s.endDate ? new Date(s.endDate) : null,
      status: s.status,
      yesPrice: s.yesPrice == null ? null : String(s.yesPrice),
      bestBid: s.bestBid == null ? null : String(s.bestBid),
      bestAsk: s.bestAsk == null ? null : String(s.bestAsk),
      volumeTotal: String(s.volumeTotal ?? 0),
      volume24h: String(s.volume24h ?? 0),
      openInterest: s.openInterest == null ? null : String(s.openInterest),
      oneDayChange: s.oneDayChange == null ? null : String(s.oneDayChange),
      slug: s.slug,
      iconUrl: s.iconUrl,
      history: s.history,
      trades: s.trades,
    }));
    for (let i = 0; i < rows.length; i += 50) {
      await this.markets.upsert(rows.slice(i, i + 50) as never, ['id']);
    }
    for (const s of dirty) s.dirty = false;
    return rows.length;
  }

  private fromRow(r: VizMarketContract): LiveState {
    return {
      id: r.id,
      source: r.source,
      sourceId: r.sourceId,
      question: r.question,
      shortLabel: r.shortLabel,
      category: r.category,
      endDate: r.endDate ? new Date(r.endDate).toISOString() : null,
      status: r.status,
      yesPrice: num(r.yesPrice),
      bestBid: num(r.bestBid),
      bestAsk: num(r.bestAsk),
      volumeTotal: num(r.volumeTotal) ?? 0,
      volume24h: num(r.volume24h) ?? 0,
      openInterest: num(r.openInterest),
      oneDayChange: num(r.oneDayChange),
      slug: r.slug,
      iconUrl: r.iconUrl,
      updatedAt: new Date(r.updatedAt ?? Date.now()).getTime(),
      history: Array.isArray(r.history) ? r.history : [],
      trades: Array.isArray(r.trades) ? r.trades : [],
      dirty: false,
    };
  }

  /* ---------------------------------------------------------------- read */

  /** §9.4 snapshot for first paint. */
  snapshot(): { markets: MarketContractDto[]; asOf: number; stale: boolean } {
    const markets = [...this.live.values()]
      .filter((s) => s.status === 'open')
      .sort((a, b) => b.volumeTotal - a.volumeTotal)
      .map(({ history, trades, dirty, ...dto }) => dto);
    return {
      markets,
      asOf: this.lastPoll || Date.now(),
      stale: this.lastPoll > 0 && Date.now() - this.lastPoll > 3 * POLL_MS,
    };
  }

  one(id: string): MarketContractDto | null {
    const s = this.live.get(id);
    if (!s) return null;
    const { history, trades, dirty, ...dto } = s;
    return dto;
  }

  /** Sparkline series. Our own ticks are the freshest but only span uptime, so
   *  the venue's history is the base and our ticks are appended. */
  async history(id: string, interval = '1w'): Promise<{ t: number; p: number }[]> {
    const s = this.live.get(id);
    if (!s) return [];
    const cached = this.historyCache.get(`${id}:${interval}`);
    let base: { t: number; p: number }[] = [];
    if (cached && Date.now() - cached.at < 60_000) base = cached.rows;
    else if (s.source === 'kalshi') {
      try {
        // The series ticker is the segment before the first dash of a market
        // ticker (KXFED-27APR-T4.25 → KXFED); the candlestick route needs both.
        const series = s.sourceId.split('-')[0];
        base = await this.kalshi.history(series, s.sourceId, interval === '1d' ? 2 : 30);
        this.historyCache.set(`${id}:${interval}`, { at: Date.now(), rows: base });
      } catch (e) {
        this.logger.warn(`kalshi history ${id}: ${(e as Error).message}`);
      }
    } else {
      try {
        const row = await this.markets.findOne({ where: { id } });
        const token = row?.yesTokenId ?? (await this.resolveToken(id));
        if (token) {
          const { data } = await this.http.get<{ history: { t: number; p: number }[] }>(
            `${CLOB}/prices-history`,
            { params: { market: token, interval, fidelity: 10 } },
          );
          base = Array.isArray(data?.history) ? data.history : [];
        }
        this.historyCache.set(`${id}:${interval}`, { at: Date.now(), rows: base });
      } catch (e) {
        this.logger.warn(`history ${id}: ${(e as Error).message}`);
      }
    }
    const lastBase = base.length ? base[base.length - 1].t : 0;
    const mine = s.history.filter((h) => h.t > lastBase);
    return [...base, ...mine];
  }

  /** The YES CLOB token id, fetched once and stored on the row. */
  private async resolveToken(id: string): Promise<string | null> {
    const s = this.live.get(id);
    if (!s) return null;
    try {
      const { data } = await this.http.get<GammaMarket[]>(`${GAMMA}/markets`, {
        params: { id: s.sourceId },
      });
      const m = Array.isArray(data) ? data[0] : null;
      const tokens = parseJsonArray(m?.clobTokenIds);
      const condition = m?.conditionId ?? null;
      if (tokens[0]) {
        await this.markets.update({ id }, { yesTokenId: tokens[0], conditionId: condition });
        return tokens[0];
      }
    } catch (e) {
      this.logger.warn(`token ${id}: ${(e as Error).message}`);
    }
    return null;
  }

  /** §7.1 streaming recent-trades feed for the open panel. */
  async trades(id: string): Promise<LiveState['trades']> {
    const cached = this.tradeCache.get(id);
    if (cached && Date.now() - cached.at < 5_000) return cached.rows;
    const s = this.live.get(id);
    if (!s) return [];
    if (s.source === 'kalshi') {
      try {
        const rows = await this.kalshi.trades(s.sourceId, TRADES_CAP);
        this.tradeCache.set(id, { at: Date.now(), rows });
        s.trades = rows.slice(0, TRADES_CAP);
        s.dirty = true;
        return rows;
      } catch (e) {
        this.logger.warn(`kalshi trades ${id}: ${(e as Error).message}`);
        return s.trades;
      }
    }
    let condition = (await this.markets.findOne({ where: { id } }))?.conditionId ?? null;
    if (!condition) {
      await this.resolveToken(id);
      condition = (await this.markets.findOne({ where: { id } }))?.conditionId ?? null;
    }
    if (!condition) return [];
    try {
      const { data } = await this.http.get<Record<string, unknown>[]>(`${DATA}/trades`, {
        params: { market: condition, limit: TRADES_CAP, takerOnly: true },
      });
      const rows = (Array.isArray(data) ? data : []).map((t) => ({
        side: String(t.side ?? '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        sizeUsd: (num(t.size) ?? 0) * (num(t.price) ?? 0),
        price: num(t.price) ?? 0,
        ts: num(t.timestamp) ?? 0,
        outcome: String(t.outcome ?? ''),
      }));
      this.tradeCache.set(id, { at: Date.now(), rows });
      s.trades = rows.slice(0, TRADES_CAP);
      s.dirty = true;
      return rows;
    } catch (e) {
      this.logger.warn(`trades ${id}: ${(e as Error).message}`);
      return s.trades;
    }
  }

  /** §7.5 the content flywheel — biggest movers, from day one. */
  movers(limit = 10): { up: MarketContractDto[]; down: MarketContractDto[] } {
    const rows = [...this.live.values()]
      .filter((s) => s.status === 'open' && s.oneDayChange != null && s.volume24h >= MIN_VOLUME_24H)
      .map(({ history, trades, dirty, ...dto }) => dto);
    const byMove = [...rows].sort(
      (a, b) => Math.abs(b.oneDayChange ?? 0) - Math.abs(a.oneDayChange ?? 0),
    );
    return {
      up: byMove.filter((r) => (r.oneDayChange ?? 0) > 0).slice(0, limit),
      down: byMove.filter((r) => (r.oneDayChange ?? 0) < 0).slice(0, limit),
    };
  }

  status(): Record<string, unknown> {
    const bySource: Record<string, number> = {};
    for (const m of this.live.values()) bySource[m.source] = (bySource[m.source] ?? 0) + 1;
    return {
      markets: this.live.size,
      bySource,
      open: [...this.live.values()].filter((s) => s.status === 'open').length,
      lastPollAgoMs: this.lastPoll ? Date.now() - this.lastPoll : null,
      lastCatalogAgoMs: this.lastCatalog ? Date.now() - this.lastCatalog : null,
      sseClients: this.realtime.clientCount('markets'),
      pollMs: POLL_MS,
    };
  }

  /* --------------------------------------------------------------- admin */

  async listCurated(): Promise<VizCuratedMarket[]> {
    return this.curated.find({ order: { sortOrder: 'ASC', shortLabel: 'ASC' } });
  }

  async upsertCurated(rows: Partial<VizCuratedMarket>[]): Promise<number> {
    const prepared = rows
      .filter((r) => r.sourceId)
      .map((r) => ({
        id: r.id ?? `${r.source ?? 'polymarket'}:${r.sourceId}`,
        source: r.source ?? 'polymarket',
        sourceId: String(r.sourceId),
        shortLabel: r.shortLabel ?? String(r.sourceId),
        category: r.category ?? 'Other',
        active: r.active ?? true,
        minVolume: String(r.minVolume ?? MIN_VOLUME_24H),
        sortOrder: r.sortOrder ?? 0,
        curatedBy: 'editor',
      }));
    if (prepared.length) await this.curated.upsert(prepared as never, ['id']);
    await this.poll();
    return prepared.length;
  }

  async removeCurated(id: string): Promise<boolean> {
    const res = await this.curated.delete({ id });
    this.live.delete(id);
    return (res.affected ?? 0) > 0;
  }
}
