import { Injectable, Logger } from '@nestjs/common';
import { IqsService } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { FundamentalsCacheService } from '../market-stats/fundamentals-cache.service';
import { EarningsService } from './earnings.service';

/** Per-symbol enrichment for one earnings-calendar row (client 2026-09-06:
 *  analyst price target, upside/downside vs. the current price, and net
 *  insider buying vs. selling in dollars). */
export interface EarningsSignal {
  symbol: string;
  price: number | null;
  priceTarget: number | null;
  analystCount: number | null;
  /** (target − price) / price, in percent, one decimal. */
  analystUpside: number | null;
  insiderBuys: number;
  insiderSells: number;
  insiderBuyValue: number;
  insiderSellValue: number;
  netInsiderValue: number;
}

/** Insider window: the trailing quarter. Insiders are locked out in the weeks
 *  before a report, so a month-to-date figure (what Hot Sectors shows) would
 *  be blank for almost every company on the calendar; a quarter covers the
 *  open window after the PREVIOUS report, which is when they can and do buy. */
export const EARNINGS_INSIDER_WINDOW_DAYS = 90;

@Injectable()
export class EarningsSignalsService {
  private readonly log = new Logger(EarningsSignalsService.name);
  private cache = new Map<string, { exp: number; data: Record<string, EarningsSignal> }>();
  private inflight = new Map<string, Promise<Record<string, EarningsSignal>>>();
  private readonly CACHE_MS = 10 * 60_000;
  private readonly QUOTE_BUDGET_MS = 8_000;

  constructor(
    private readonly earnings: EarningsService,
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
    private readonly fundamentals: FundamentalsCacheService,
  ) {}

  async forCalendar(days: number): Promise<Record<string, EarningsSignal>> {
    const key = String(days);
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.data;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.build(days)
      .then((data) => {
        this.cache.set(key, { exp: Date.now() + this.CACHE_MS, data });
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async build(days: number): Promise<Record<string, EarningsSignal>> {
    const cal = await this.earnings.getCalendar(days);
    const symbols = Array.from(
      new Set(cal.map((r) => String(r.symbol || '').toUpperCase()).filter(Boolean)),
    );
    if (!symbols.length) return {};
    const since = new Date(Date.now() - EARNINGS_INSIDER_WINDOW_DAYS * 86_400_000);
    const [quotes, fundamentals, buySell] = await Promise.all([
      this.marketStats
        .getQuoteBatch(symbols, { deadlineMs: Date.now() + this.QUOTE_BUDGET_MS })
        .catch((e) => {
          this.log.warn(`earnings signals: quotes failed: ${e?.message || e}`);
          return new Map();
        }),
      this.fundamentals.lookup(symbols).catch(() => new Map()),
      this.iqs.getMonthlyBuySellByTicker(symbols, { since }).catch(() => new Map()),
    ]);
    const out: Record<string, EarningsSignal> = {};
    for (const sym of symbols) {
      const q = quotes.get(sym) as { price?: number } | undefined;
      const f = fundamentals.get(sym) as
        | { ptAvgTarget: number | null; ptCount: number | null }
        | undefined;
      const bs = buySell.get(sym) as
        | { buys: number; sells: number; buyValue: number; sellValue: number }
        | undefined;
      const price = q?.price && q.price > 0 ? q.price : null;
      const target = f?.ptAvgTarget != null && f.ptAvgTarget > 0 ? f.ptAvgTarget : null;
      const analystUpside =
        target != null && price != null ? +(((target - price) / price) * 100).toFixed(1) : null;
      out[sym] = {
        symbol: sym,
        price,
        priceTarget: target,
        analystCount: f?.ptCount ?? null,
        analystUpside,
        insiderBuys: bs?.buys ?? 0,
        insiderSells: bs?.sells ?? 0,
        insiderBuyValue: Math.round(bs?.buyValue ?? 0),
        insiderSellValue: Math.round(bs?.sellValue ?? 0),
        netInsiderValue: Math.round((bs?.buyValue ?? 0) - (bs?.sellValue ?? 0)),
      };
    }
    return out;
  }
}
