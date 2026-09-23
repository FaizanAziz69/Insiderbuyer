import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { Series } from './reconstruction';

/**
 * Close series for every ticker a member has traded, persisted in
 * `price_history_cache` — the same per-symbol table the insider-strategy
 * backtest fills, same shape (ascending [{t, c}], dividend-adjusted), so the
 * two never disagree on a price and a symbol fetched for one is free for the
 * other. FMP caps any EOD request at 5,000 sessions (~20 years); FROM is set
 * so the cap, not the date, is the bound.
 *
 * Refresh policy: a symbol someone currently holds or traded in the last two
 * years is refreshed when older than a day; the rest weekly. Nothing is
 * computed from the network at request time.
 *
 * Symbol renames: FMP's `symbol-change` list is thin (2023 onward on
 * 2026-09-23), so it is a best effort. A PTR ticker with no series is tried
 * as its renamed successor and with the `BRK.B` → `BRK-B` spelling FMP uses.
 * What still has no series stays unpriced and is reported as such.
 */

const FROM = '2006-01-01';
const DAY = 86_400_000;
export const BENCHMARK = 'SPY';

@Injectable()
export class PricesService {
  private readonly log = new Logger(PricesService.name);
  private renames: Map<string, string> | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS price_history_cache (
      symbol varchar(24) PRIMARY KEY,
      points jsonb NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_symbol_map (
      old_symbol text PRIMARY KEY,
      new_symbol text NOT NULL,
      changed_on date,
      company_name text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async refreshRenames(): Promise<number> {
    await this.ensureTables();
    const all = await this.fmp.getSymbolChanges(5000);
    // A symbol can be reused (renamed away, then renamed to again); the
    // newest change per old symbol wins, and one row per key keeps the
    // upsert legal.
    const byOld = new Map<string, (typeof all)[number]>();
    for (const r of all) {
      const prev = byOld.get(r.oldSymbol);
      if (!prev || r.date > prev.date) byOld.set(r.oldSymbol, r);
    }
    const rows = Array.from(byOld.values());
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values: any[] = [];
      const tuples = chunk.map((r, k) => {
        const b = k * 4;
        values.push(r.oldSymbol, r.newSymbol, r.date, r.companyName);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
      });
      await this.q(
        `INSERT INTO wt_symbol_map (old_symbol,new_symbol,changed_on,company_name) VALUES ${tuples.join(',')}
         ON CONFLICT (old_symbol) DO UPDATE SET new_symbol = EXCLUDED.new_symbol, changed_on = EXCLUDED.changed_on, company_name = EXCLUDED.company_name, updated_at = now()`,
        values,
      );
    }
    this.renames = null;
    return rows.length;
  }

  private async renameMap(): Promise<Map<string, string>> {
    if (this.renames) return this.renames;
    const rows = await this.q<Array<{ old_symbol: string; new_symbol: string }>>(`SELECT old_symbol, new_symbol FROM wt_symbol_map`);
    this.renames = new Map(rows.map((r) => [r.old_symbol, r.new_symbol]));
    return this.renames;
  }

  /** Candidate vendor spellings for a filed ticker, best first. */
  async candidates(ticker: string): Promise<string[]> {
    const t = ticker.toUpperCase();
    const out = [t];
    const dashed = t.replace(/[./]/g, '-');
    if (dashed !== t) out.push(dashed);
    const renames = await this.renameMap();
    let cur = t;
    for (let hops = 0; hops < 3; hops++) {
      const next = renames.get(cur);
      if (!next || out.includes(next)) break;
      out.push(next);
      cur = next;
    }
    return out;
  }

  async load(symbol: string): Promise<Series | null> {
    const rows = await this.q<Array<{ points: Array<{ t: number; c: number }> }>>(`SELECT points FROM price_history_cache WHERE symbol = $1`, [symbol.toUpperCase()]);
    const pts = rows[0]?.points;
    if (!Array.isArray(pts) || !pts.length) return null;
    return { t: pts.map((p) => p.t), c: pts.map((p) => p.c) };
  }

  /** Series under the first candidate spelling that has one; the spelling used comes back too. */
  async loadResolved(ticker: string): Promise<{ symbol: string; series: Series } | null> {
    for (const sym of await this.candidates(ticker)) {
      const s = await this.load(sym);
      if (s) return { symbol: sym, series: s };
    }
    return null;
  }

  private async fetchAndStore(symbol: string): Promise<boolean> {
    const bars = await this.fmp.getEodBars(symbol, { from: FROM, adjusted: true, noCache: true });
    if (!bars.length) return false;
    const points = bars.map((b) => ({ t: b.t, c: b.close })).filter((p) => Number.isFinite(p.c) && p.c > 0);
    if (!points.length) return false;
    await this.q(
      `INSERT INTO price_history_cache (symbol, points, "updatedAt") VALUES ($1, $2::jsonb, now())
       ON CONFLICT (symbol) DO UPDATE SET points = EXCLUDED.points, "updatedAt" = now()`,
      [symbol, JSON.stringify(points)],
    );
    return true;
  }

  /**
   * Make sure every ticker has a series fresh enough. `hot` tickers refresh
   * daily, the rest weekly. Returns what could not be priced under any spelling.
   */
  async ensure(
    tickers: string[],
    hot: Set<string>,
    opts: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
  ): Promise<{ fetched: number; unpriced: string[] }> {
    await this.ensureTables();
    const wanted = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
    const ages = new Map<string, number>();
    for (let i = 0; i < wanted.length; i += 1000) {
      const chunk = wanted.slice(i, i + 1000);
      const cands = new Set<string>();
      for (const t of chunk) for (const c of await this.candidates(t)) cands.add(c);
      const rows = await this.q<Array<{ symbol: string; age_ms: string }>>(
        `SELECT symbol, extract(epoch FROM (now() - "updatedAt")) * 1000 AS age_ms FROM price_history_cache WHERE symbol = ANY($1)`,
        [Array.from(cands)],
      );
      for (const r of rows) ages.set(r.symbol, Number(r.age_ms));
    }
    const todo: string[] = [];
    for (const t of wanted) {
      const cs = await this.candidates(t);
      const have = cs.find((c) => ages.has(c));
      const maxAge = hot.has(t) ? DAY : 7 * DAY;
      if (!have || (ages.get(have) as number) > maxAge) todo.push(t);
    }
    let fetched = 0;
    let done = 0;
    const unpriced: string[] = [];
    let cursor = 0;
    const concurrency = opts.concurrency ?? 4;
    const worker = async () => {
      while (cursor < todo.length) {
        const t = todo[cursor++];
        try {
          let ok = false;
          for (const sym of await this.candidates(t)) {
            if (await this.fetchAndStore(sym)) {
              ok = true;
              break;
            }
          }
          if (ok) fetched++;
          else unpriced.push(t);
        } catch (e: any) {
          this.log.warn(`price fetch ${t}: ${e?.message || e}`);
          unpriced.push(t);
        }
        done++;
        opts.onProgress?.(done, todo.length);
        if (done % 250 === 0) this.log.log(`prices ${done}/${todo.length} (${fetched} stored)`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { fetched, unpriced };
  }

  async ensureBenchmark(): Promise<Series | null> {
    await this.ensure([BENCHMARK], new Set([BENCHMARK]));
    return this.load(BENCHMARK);
  }
}
