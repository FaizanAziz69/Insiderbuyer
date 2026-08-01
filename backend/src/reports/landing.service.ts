import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { InsiderTransaction } from '../entities/insider-transaction.entity';

/**
 * Real numbers for the /insider-report landing page, replacing the mock's
 * illustrative panels:
 *   - top stocks by trailing-90d open-market insider buying / selling
 *     (from our own Form 4 archive), each with its real 3-month return
 *     vs SPY (Yahoo chart closes)
 *   - filings ingested over the last 12 months
 * Cached in-memory for 6h — the landing page is high-traffic and none of
 * this moves intraday.
 */

export interface PanelRow {
  ticker: string;
  totalValue: number;
  insiders: number;
  /** 3-month price return minus SPY's, in percentage points; null if the
   *  price fetch failed for this symbol. */
  vsSpxPct: number | null;
}

export interface LandingPanels {
  buys: PanelRow[];
  sells: PanelRow[];
  stats: {
    filings12mo: number;
    /** Average 3-mo return vs SPY across the top buying / selling stocks. */
    buyingVsSpxPct: number | null;
    sellingVsSpxPct: number | null;
  };
}

const CACHE_MS = 6 * 60 * 60_000;

@Injectable()
export class LandingService {
  private readonly logger = new Logger(LandingService.name);
  private cache: { ts: number; data: LandingPanels } | null = null;
  private inflight: Promise<LandingPanels> | null = null;
  private readonly http = axios.create({
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });

  constructor(
    @InjectRepository(InsiderTransaction)
    private readonly tx: Repository<InsiderTransaction>,
  ) {}

  async getPanels(): Promise<LandingPanels> {
    if (this.cache && Date.now() - this.cache.ts < CACHE_MS) return this.cache.data;
    if (this.inflight) return this.inflight;
    this.inflight = this.build().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async build(): Promise<LandingPanels> {
    const [buyAgg, sellAgg, filings12mo] = await Promise.all([
      this.aggregate('P'),
      this.aggregate('S'),
      this.tx
        .createQueryBuilder('t')
        .where(`t."transactionDate" >= :d`, {
          d: new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10),
        })
        .getCount(),
    ]);

    // One benchmark + every candidate's 3-month return, fetched best-effort.
    const symbols = Array.from(
      new Set([...buyAgg, ...sellAgg].map((r) => r.ticker)),
    );
    const returns = await this.threeMonthReturns(['SPY', ...symbols]);
    const spy = returns.get('SPY');

    const withVs = (rows: { ticker: string; totalValue: number; insiders: number }[]) =>
      rows
        .map((r) => {
          const ret = returns.get(r.ticker);
          return {
            ...r,
            vsSpxPct:
              ret != null && spy != null ? +((ret - spy) * 100).toFixed(1) : null,
          };
        })
        // Rows without a price are still real insider data — keep them, but
        // prefer priced rows at the top so the "vs S&P" column reads clean.
        .sort((a, b) => Number(b.vsSpxPct != null) - Number(a.vsSpxPct != null))
        .slice(0, 4);

    const buys = withVs(buyAgg);
    const sells = withVs(sellAgg);

    const avg = (rows: PanelRow[]) => {
      const vals = rows.map((r) => r.vsSpxPct).filter((v): v is number => v != null);
      return vals.length
        ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        : null;
    };

    const data: LandingPanels = {
      buys,
      sells,
      stats: {
        filings12mo,
        buyingVsSpxPct: avg(buys),
        sellingVsSpxPct: avg(sells),
      },
    };
    this.cache = { ts: Date.now(), data };
    return data;
  }

  /** Top tickers by trailing-90d open-market dollars for one Form 4 code. */
  private async aggregate(code: 'P' | 'S') {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const rows: Array<{ ticker: string; total: string; insiders: string }> =
      await this.tx
        .createQueryBuilder('t')
        .innerJoin('t.company', 'c')
        .select('c.ticker', 'ticker')
        .addSelect('SUM(t."totalValue")', 'total')
        .addSelect('COUNT(DISTINCT t."insiderName")', 'insiders')
        .where(`t."transactionCode" = :code`, { code })
        .andWhere(`t."transactionDate" >= :since`, { since })
        // Same parse-artifact guard the trades feed uses.
        .andWhere(`t."pricePerShare" <= 1000000`)
        .andWhere(`c.ticker IS NOT NULL`)
        .groupBy('c.ticker')
        .orderBy('total', 'DESC')
        .limit(6)
        .getRawMany();
    return rows.map((r) => ({
      ticker: String(r.ticker).toUpperCase(),
      totalValue: Number(r.total) || 0,
      insiders: Number(r.insiders) || 0,
    }));
  }

  /** 3-month total return per symbol from Yahoo daily closes (fractional). */
  private async threeMonthReturns(symbols: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const host = sym.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
          const { data } = await this.http.get(
            `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`,
          );
          const closes: number[] = (
            data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []
          )
            .map((c: unknown) => Number(c))
            .filter((c: number) => Number.isFinite(c) && c > 0);
          if (closes.length >= 2) {
            out.set(sym, closes[closes.length - 1] / closes[0] - 1);
          }
        } catch {
          this.logger.debug(`3mo return fetch failed for ${sym}`);
        }
      }),
    );
    return out;
  }
}
