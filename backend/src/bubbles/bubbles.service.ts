import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BubblesCache, BubblesTickerMeta } from '../entities/bubbles-cache.entity';
import { FmpService } from '../fmp/fmp.service';

/** Time windows the map offers. Label doubles as the cache primary key. */
const WINDOWS: Array<[string, number]> = [
  ['1d', 1],
  ['1w', 7],
  ['30d', 30],
  ['3m', 90],
  ['6m', 180],
  ['9m', 270],
  ['1y', 365],
];

/** Qualification floor: aggregate open-market buys per insider per day.
 *  Brief v1.0 said $250k; lowered to $100k on Faizan's call (2026-08-23,
 *  "add more bubbles") — flip this one constant to change the tape. */
const MIN_BUY = 100_000;

/** Field perf budget — the payload is capped to the largest N tickers. */
const MAX_BUBBLES = 250;

/** Per-symbol enrichment (90d avg, description, TTM financials) refreshes on
 *  its own daily clock, in bounded batches, so one refresh can never fan out
 *  to hundreds of FMP calls. Missing symbols accrue over successive runs. */
const META_TTL_MS = 24 * 3600_000;
const META_BATCH = 60;
const META_CONCURRENCY = 4;

const STALE_MS = 14 * 60_000;

interface BuyEvent {
  id: string;
  who: string;
  role: string;
  title: string | null;
  d: string; // transaction date, YYYY-MM-DD
  daysAgo: number;
  sh: number;
  px: number;
  val: number;
  filing: string | null;
}

@Injectable()
export class BubblesService {
  private readonly logger = new Logger(BubblesService.name);
  private tablesReady = false;

  constructor(
    @InjectRepository(BubblesCache)
    private readonly cacheRepo: Repository<BubblesCache>,
    @InjectRepository(BubblesTickerMeta)
    private readonly metaRepo: Repository<BubblesTickerMeta>,
    @Optional() private readonly fmp?: FmpService,
  ) {}

  /** On EC2/local the in-process scheduler keeps the map fresh; on Vercel the
   *  GitHub workflow hits /api/bubbles/cron instead (functions have no clock). */
  @Cron('*/15 * * * *')
  async cronTick(): Promise<void> {
    if (process.env.VERCEL) return;
    try {
      await this.refreshIfStale();
    } catch (e: any) {
      this.logger.warn(`bubbles cron refresh failed: ${e?.message || e}`);
    }
  }

  async read(windowRaw?: string): Promise<unknown> {
    const window = this.normalizeWindow(windowRaw);
    await this.ensureTables();
    const rows = await this.cacheRepo.query(
      'SELECT payload, "updatedAt" FROM bubbles_cache WHERE "window" = $1',
      [window],
    );
    if (!rows?.length) {
      return { window, generatedAt: null, count: 0, bubbles: [] };
    }
    return rows[0].payload;
  }

  async status(): Promise<unknown> {
    await this.ensureTables();
    const rows = await this.cacheRepo.query(
      `SELECT "window", jsonb_array_length(payload->'bubbles') AS bubbles, "updatedAt"
       FROM bubbles_cache ORDER BY "updatedAt" DESC`,
    );
    const meta = await this.cacheRepo.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE avg90 IS NOT NULL)::int AS "withAvg90",
              MIN("updatedAt") AS oldest
       FROM bubbles_ticker_meta`,
    );
    return { windows: rows, meta: meta?.[0] ?? null };
  }

  async refreshIfStale(maxAgeMs = STALE_MS): Promise<unknown> {
    await this.ensureTables();
    const rows = await this.cacheRepo.query(
      'SELECT MIN("updatedAt") AS oldest, COUNT(*)::int AS n FROM bubbles_cache',
    );
    const oldest = rows?.[0]?.oldest ? new Date(rows[0].oldest).getTime() : 0;
    const complete = Number(rows?.[0]?.n || 0) >= WINDOWS.length;
    if (complete && Date.now() - oldest < maxAgeMs) {
      return { refreshed: false, ageMs: Date.now() - oldest };
    }
    return { refreshed: true, ...(await this.refresh()) };
  }

  /** Rebuild all seven window payloads. SQL-only except for the bounded
   *  per-ticker enrichment batch, so it is safe on a 15-minute clock. */
  async refresh(): Promise<{ tickers: number; metaRefreshed: number; windows: number }> {
    await this.ensureTables();

    // 1. Qualifying buy events: open-market (code P), unplanned, aggregated
    //    per insider per ticker per day, ≥ $250k. One year back covers every
    //    window in one pass.
    const buyRows: Array<{
      t: string;
      name: string;
      who: string;
      role: string;
      title: string | null;
      d: string;
      sh: number;
      val: number;
      acc: string;
      filing: string | null;
    }> = await this.cacheRepo.query(
      `SELECT c.ticker AS t, MAX(c.name) AS name,
              t."insiderName" AS who, MAX(t.role) AS role, MAX(t."rawTitle") AS title,
              t."transactionDate"::text AS d,
              SUM(t."sharesBought")::float8 AS sh,
              SUM(t."totalValue")::float8 AS val,
              MIN(t."accessionNumber") AS acc,
              MIN(t."filingUrl") AS filing
       FROM insider_transactions t
       JOIN companies c ON c.id = t.company_id
       WHERE t."transactionCode" = 'P'
         AND t."plannedBuy" = false
         AND t."transactionDate" >= (CURRENT_DATE - 366)
         AND c.ticker IS NOT NULL AND c.ticker <> ''
         AND t."totalValue" > 0 AND t."sharesBought" > 0
       GROUP BY c.ticker, t."insiderName", t."transactionDate"
       HAVING SUM(t."totalValue") >= $1`,
      [MIN_BUY],
    );

    // 2. Sells (code S) per ticker per day — the panel's net-flow figure.
    const sellRows: Array<{ t: string; d: string; val: number }> =
      await this.cacheRepo.query(
        `SELECT c.ticker AS t, t."transactionDate"::text AS d,
                SUM(t."totalValue")::float8 AS val
         FROM insider_transactions t
         JOIN companies c ON c.id = t.company_id
         WHERE t."transactionCode" = 'S'
           AND t."transactionDate" >= (CURRENT_DATE - 366)
           AND c.ticker IS NOT NULL AND c.ticker <> ''
           AND t."totalValue" > 0
         GROUP BY c.ticker, t."transactionDate"`,
      );

    const today = this.utcMidnight();
    const daysAgo = (d: string) =>
      Math.max(0, Math.round((today - Date.parse(d + 'T00:00:00Z')) / 86_400_000));

    const eventsByTicker = new Map<string, { name: string; events: BuyEvent[] }>();
    for (const r of buyRows) {
      const sym = r.t.toUpperCase();
      const sh = Number(r.sh) || 0;
      const val = Number(r.val) || 0;
      if (!sh || !val) continue;
      const rec = eventsByTicker.get(sym) || { name: r.name, events: [] };
      rec.events.push({
        id: `${sym}:${r.d}:${r.who}`,
        who: r.who,
        role: r.role || 'Other',
        title: r.title || null,
        d: r.d,
        daysAgo: daysAgo(r.d),
        sh,
        px: val / sh,
        val,
        filing: r.filing || null,
      });
      eventsByTicker.set(sym, rec);
    }

    const sellsByTicker = new Map<string, Array<{ daysAgo: number; val: number }>>();
    for (const r of sellRows) {
      const sym = r.t.toUpperCase();
      const list = sellsByTicker.get(sym) || [];
      list.push({ daysAgo: daysAgo(r.d), val: Number(r.val) || 0 });
      sellsByTicker.set(sym, list);
    }

    const tickers = Array.from(eventsByTicker.keys());
    if (!tickers.length) {
      this.logger.warn('bubbles refresh: no qualifying buy events in the last year');
    }

    // 3. Joins off tables the platform already keeps fresh.
    const snapshot = new Map<string, any>();
    if (tickers.length) {
      const rows = await this.cacheRepo.query(
        `SELECT symbol, name, price::float8 AS price, "changePct"::float8 AS chg,
                "marketCap"::float8 AS mcap, sector, exchange
         FROM market_profile_snapshot WHERE symbol = ANY($1)`,
        [tickers],
      );
      for (const r of rows) snapshot.set(r.symbol, r);
    }

    const targets = new Map<string, number>();
    if (tickers.length) {
      const rows = await this.cacheRepo.query(
        `SELECT symbol, "ptAvgTarget"::float8 AS target
         FROM fundamentals_cache WHERE symbol = ANY($1) AND "ptAvgTarget" IS NOT NULL`,
        [tickers],
      );
      for (const r of rows) targets.set(r.symbol, Number(r.target));
    }

    const iqs = new Map<string, number>();
    if (tickers.length) {
      const rows = await this.cacheRepo.query(
        `SELECT DISTINCT ON (c.ticker) c.ticker AS t, s.iqs::float8 AS iq
         FROM iqs_scores s JOIN companies c ON c.id = s.company_id
         WHERE c.ticker = ANY($1)
         ORDER BY c.ticker, s."asOfDate" DESC`,
        [tickers],
      );
      for (const r of rows) iqs.set(r.t.toUpperCase(), Number(r.iq));
    }

    // 4. Bounded per-ticker enrichment, then read the whole meta table back.
    const metaRefreshed = await this.refreshMetaBatch(tickers);
    const meta = new Map<string, any>();
    if (tickers.length) {
      const rows = await this.cacheRepo.query(
        `SELECT symbol, avg90::float8 AS avg90, about, exchange,
                "revenueTtm"::float8 AS rev, "netIncomeTtm"::float8 AS ni
         FROM bubbles_ticker_meta WHERE symbol = ANY($1)`,
        [tickers],
      );
      for (const r of rows) meta.set(r.symbol, r);
    }

    // 5. Compose and store one payload per window.
    const generatedAt = new Date().toISOString();
    for (const [label, days] of WINDOWS) {
      const bubbles: any[] = [];
      for (const [sym, rec] of eventsByTicker) {
        const events = rec.events
          .filter((e) => e.daysAgo <= days)
          .sort((a, b) => a.daysAgo - b.daysAgo);
        if (!events.length) continue;
        const total = events.reduce((s, e) => s + e.val, 0);
        const shares = events.reduce((s, e) => s + e.sh, 0);
        const vwaip = shares > 0 ? total / shares : 0;
        const sold = (sellsByTicker.get(sym) || [])
          .filter((s) => s.daysAgo <= days)
          .reduce((s, x) => s + x.val, 0);
        const snap = snapshot.get(sym);
        const m = meta.get(sym);
        bubbles.push({
          t: sym,
          name: snap?.name || rec.name,
          exch: m?.exchange || snap?.exchange || null,
          sector: snap?.sector || null,
          price: snap?.price != null ? Number(snap.price) : null,
          chg: snap?.chg != null ? Number(snap.chg) : null,
          mcap: snap?.mcap != null ? Number(snap.mcap) : null,
          avg90: m?.avg90 != null ? Number(m.avg90) : null,
          about: m?.about || null,
          rev: m?.rev != null ? Number(m.rev) : null,
          ni: m?.ni != null ? Number(m.ni) : null,
          iq: iqs.get(sym) ?? null,
          target: targets.get(sym) ?? null,
          total: Math.round(total),
          vwaip: Number(vwaip.toFixed(4)),
          sold: Math.round(sold),
          buys: events.map((e) => ({
            id: e.id,
            who: e.who,
            role: e.role,
            title: e.title,
            d: e.d,
            sh: Math.round(e.sh),
            px: Number(e.px.toFixed(4)),
            val: Math.round(e.val),
            filing: e.filing,
          })),
        });
      }
      bubbles.sort((a, b) => b.total - a.total);
      const capped = bubbles.slice(0, MAX_BUBBLES);
      const payload = {
        window: label,
        generatedAt,
        count: bubbles.length,
        shown: capped.length,
        bubbles: capped,
      };
      await this.cacheRepo.query(
        `INSERT INTO bubbles_cache ("window", payload, "updatedAt")
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT ("window") DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()`,
        [label, JSON.stringify(payload)],
      );
    }

    return { tickers: tickers.length, metaRefreshed, windows: WINDOWS.length };
  }

  /** Refresh missing/stale per-ticker meta, at most META_BATCH symbols per
   *  run. A symbol with no FMP answer still gets its row stamped, so a dead
   *  symbol cannot occupy the batch every run for a day. */
  private async refreshMetaBatch(tickers: string[]): Promise<number> {
    if (!tickers.length || !this.fmp?.enabled) return 0;
    const stale: Array<{ symbol: string }> = await this.cacheRepo.query(
      `SELECT u.symbol FROM unnest($1::text[]) AS u(symbol)
       LEFT JOIN bubbles_ticker_meta m ON m.symbol = u.symbol
       WHERE m.symbol IS NULL OR m."updatedAt" < now() - interval '24 hours'
       ORDER BY m."updatedAt" NULLS FIRST
       LIMIT $2`,
      [tickers, META_BATCH],
    );
    if (!stale.length) return 0;

    const from = new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10);
    let done = 0;
    const queue = stale.map((r) => r.symbol);
    const worker = async () => {
      for (;;) {
        const sym = queue.shift();
        if (!sym) return;
        try {
          const [bars, profile, ittm] = await Promise.all([
            this.fmp!.getEodBars(sym, { from, light: true }),
            this.fmp!.getCompanyProfile(sym),
            this.fmp!.getIncomeStatementTtm(sym),
          ]);
          const closes = (bars || []).map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
          const avg90 = closes.length
            ? closes.reduce((s, c) => s + c, 0) / closes.length
            : null;
          const rev = Number(ittm?.revenue);
          const ni = Number(ittm?.netIncome);
          await this.cacheRepo.query(
            `INSERT INTO bubbles_ticker_meta
               (symbol, avg90, about, exchange, "revenueTtm", "netIncomeTtm", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (symbol) DO UPDATE SET
               avg90 = EXCLUDED.avg90, about = EXCLUDED.about,
               exchange = EXCLUDED.exchange, "revenueTtm" = EXCLUDED."revenueTtm",
               "netIncomeTtm" = EXCLUDED."netIncomeTtm", "updatedAt" = now()`,
            [
              sym,
              avg90 != null ? avg90.toFixed(6) : null,
              profile?.description ? String(profile.description).slice(0, 700) : null,
              profile?.exchange || null,
              Number.isFinite(rev) ? rev.toFixed(2) : null,
              Number.isFinite(ni) ? ni.toFixed(2) : null,
            ],
          );
          done += 1;
        } catch (e: any) {
          this.logger.warn(`bubbles meta refresh ${sym} failed: ${e?.message || e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: META_CONCURRENCY }, worker));
    return done;
  }

  private normalizeWindow(raw?: string): string {
    const v = String(raw || '').trim().toLowerCase();
    return WINDOWS.some(([label]) => label === v) ? v : '30d';
  }

  private utcMidnight(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  /** Serverless boots with synchronize off, so a new entity gets no table —
   *  scoped CREATE IF NOT EXISTS, same as PeCacheService.ensureTable. */
  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    try {
      await this.cacheRepo.query(
        `CREATE TABLE IF NOT EXISTS bubbles_cache (
           "window" varchar(8) NOT NULL,
           payload jsonb NOT NULL,
           "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
           CONSTRAINT "PK_bubbles_cache" PRIMARY KEY ("window")
         )`,
      );
      await this.cacheRepo.query(
        `CREATE TABLE IF NOT EXISTS bubbles_ticker_meta (
           symbol varchar(16) NOT NULL,
           avg90 numeric(20,6),
           about text,
           exchange varchar(48),
           "revenueTtm" numeric(24,2),
           "netIncomeTtm" numeric(24,2),
           "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
           CONSTRAINT "PK_bubbles_ticker_meta" PRIMARY KEY (symbol)
         )`,
      );
      this.tablesReady = true;
    } catch (e: any) {
      this.logger.warn(`bubbles table check failed: ${e?.message || e}`);
    }
  }
}
