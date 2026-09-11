import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from '../entities/company.entity';

/**
 * §3.4 "Insider Intelligence" — the one panel section every listed company in
 * the suite carries, and the funnel into Premium.
 *
 * The brief calls this our moat, which is exactly why it must not be
 * reimplemented per vertical: Goldminer, Biotech, Gov Contracts and any future
 * vertical all read this service, so ownership %, 90-day net buying, the IQ
 * Score and the notable-transaction list are defined once and agree with the
 * rest of the site (they come from the same `iqs_scores` and
 * `insider_transactions` rows the company pages read).
 */

export interface InsiderSnapshotDto {
  ticker: string;
  name: string | null;
  exchange: string | null;
  marketCap: number | null;
  price: number | null;
  insiderOwnershipPct: number | null;
  netBuys90d: number | null;
  netSells90d: number | null;
  iqsScore: number | null;
  notable: {
    who: string;
    role: string | null;
    date: string;
    value: number;
    side: 'buy' | 'sell';
  }[];
  /** false when the ticker is not in our scored universe at all. */
  covered: boolean;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

@Injectable()
export class InsiderSnapshotService {
  private readonly logger = new Logger(InsiderSnapshotService.name);
  private readonly cache = new Map<string, { at: number; dto: InsiderSnapshotDto }>();
  private readonly TTL = 10 * 60_000;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly ds: DataSource,
  ) {}

  async get(tickerRaw: string): Promise<InsiderSnapshotDto> {
    const ticker = (tickerRaw || '').trim().toUpperCase();
    const hit = this.cache.get(ticker);
    if (hit && Date.now() - hit.at < this.TTL) return hit.dto;

    const empty: InsiderSnapshotDto = {
      ticker,
      name: null,
      exchange: null,
      marketCap: null,
      price: null,
      insiderOwnershipPct: null,
      netBuys90d: null,
      netSells90d: null,
      iqsScore: null,
      notable: [],
      covered: false,
    };
    if (!ticker) return empty;

    try {
      const company = await this.companies.findOne({ where: { ticker } });
      if (!company) {
        this.cache.set(ticker, { at: Date.now(), dto: empty });
        return empty;
      }

      const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const [scoreRow] = await this.ds.query(
        `SELECT s.iqs::float8 AS iqs, s."insiderOwnershipPct"::float8 AS own
           FROM iqs_scores s
          WHERE s.company_id = $1
          ORDER BY s."asOfDate" DESC
          LIMIT 1`,
        [company.id],
      );

      const [flow] = await this.ds.query(
        `SELECT
            COALESCE(SUM(CASE WHEN "transactionCode" = 'P' THEN "totalValue" END), 0)::float8 AS buys,
            COALESCE(SUM(CASE WHEN "transactionCode" = 'S' THEN "totalValue" END), 0)::float8 AS sells
           FROM insider_transactions
          WHERE company_id = $1 AND "transactionDate" >= $2`,
        [company.id, since],
      );

      const notableRows = await this.ds.query(
        `SELECT "insiderName" AS who, role, "transactionDate" AS date,
                "totalValue"::float8 AS value, "transactionCode" AS code
           FROM insider_transactions
          WHERE company_id = $1
            AND "transactionCode" IN ('P','S')
            AND "transactionDate" >= $2
          ORDER BY "totalValue" DESC
          LIMIT 5`,
        [company.id, since],
      );

      const dto: InsiderSnapshotDto = {
        ticker,
        name: company.name ?? null,
        exchange: company.exchange ?? null,
        marketCap: num(company.marketCap),
        price: num(company.lastPrice),
        insiderOwnershipPct: num(scoreRow?.own),
        netBuys90d: num(flow?.buys) ?? 0,
        netSells90d: num(flow?.sells) ?? 0,
        iqsScore: num(scoreRow?.iqs),
        notable: (notableRows ?? []).map((r: Record<string, unknown>) => ({
          who: String(r.who ?? ''),
          role: (r.role as string) ?? null,
          date: new Date(r.date as string).toISOString().slice(0, 10),
          value: num(r.value) ?? 0,
          side: r.code === 'S' ? ('sell' as const) : ('buy' as const),
        })),
        covered: true,
      };
      this.cache.set(ticker, { at: Date.now(), dto });
      return dto;
    } catch (e) {
      this.logger.warn(`snapshot ${ticker}: ${(e as Error).message}`);
      return empty;
    }
  }

  /** Batch form — the "insiders buying" filter toggles need the whole field. */
  async many(tickers: string[]): Promise<Record<string, InsiderSnapshotDto>> {
    const out: Record<string, InsiderSnapshotDto> = {};
    for (const t of tickers) out[t.toUpperCase()] = await this.get(t);
    return out;
  }

  /**
   * The filter predicate behind §4.5 / §5.3 / §6.2's shared "insiders buying"
   * toggle: which of these tickers saw open-market buying in the window.
   */
  async buyingSet(tickers: string[], days = 90): Promise<Set<string>> {
    const clean = [...new Set(tickers.map((t) => (t || '').toUpperCase()).filter(Boolean))];
    if (clean.length === 0) return new Set();
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    try {
      const rows = await this.ds.query(
        `SELECT DISTINCT c.ticker
           FROM insider_transactions t
           JOIN companies c ON c.id = t.company_id
          WHERE t."transactionCode" = 'P'
            AND t."transactionDate" >= $1
            AND c.ticker = ANY($2)`,
        [since, clean],
      );
      return new Set((rows ?? []).map((r: { ticker: string }) => r.ticker.toUpperCase()));
    } catch (e) {
      this.logger.warn(`buyingSet: ${(e as Error).message}`);
      return new Set();
    }
  }
}
