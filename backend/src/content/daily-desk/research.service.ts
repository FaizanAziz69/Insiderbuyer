import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plausibleTxSql } from '../../iqs/tx-sanity';

/**
 * What happened today, in our own record.
 *
 * The desk writes from THIS, never from the model's memory. Every candidate
 * carries the figures the article will quote, so the writer is arranging facts
 * rather than recalling them, which is the only way an unreviewed daily piece
 * can be trusted.
 *
 * Three traps are baked in, each paid for by a real article:
 *   * the plausibility guard (tx-sanity) drops Form 4 rows whose price sits far
 *     off the market, which is where the "fake buy" candidates come from;
 *   * joint filers are collapsed. ProFrac's Wilks Dan H. and THRC Holdings file
 *     the SAME purchase separately, and counting both doubled a $2.87M buy into
 *     $5.7M in an earlier draft;
 *   * anything we have already written about in the last 21 days is excluded,
 *     so the desk cannot rediscover Monday's story on Thursday.
 */

export interface BuyCandidate {
  kind: 'single-buy' | 'cluster-buy' | 'politician';
  ticker: string;
  company: string;
  sector: string | null;
  /** Who bought: an insider name, or a member of Congress. */
  who: string;
  role: string | null;
  date: string;
  value: number;
  shares: number | null;
  /** Distinct buyers, for a cluster. */
  buyers?: number;
  /** Everything the writer may quote, already reconciled. */
  facts: Record<string, unknown>;
}

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Slugs already published recently, so the desk never repeats itself. */
  async recentlyCovered(days = 21): Promise<{ slugs: string[]; tickers: string[]; people: string[] }> {
    const rows = await this.db.query(
      `SELECT slug, ticker, title, tags FROM blog_posts
       WHERE "generatedAt" >= NOW() - ($1 || ' days')::interval`,
      [String(days)],
    );
    const tickers = new Set<string>();
    const people = new Set<string>();
    for (const r of rows) {
      if (r.ticker) tickers.add(String(r.ticker).toUpperCase());
      for (const t of (r.tags as string[]) || []) people.add(String(t).toLowerCase());
    }
    return {
      slugs: rows.map((r: any) => r.slug),
      tickers: [...tickers],
      people: [...people],
    };
  }

  /**
   * The single biggest open-market purchases of the last few days.
   *
   * Grouped by company + insider + date + price so a purchase split across
   * several rows of one Form 4 counts once, and filed by two entities counts
   * once (see the joint-filer trap above).
   */
  async biggestBuys(sinceDays = 5, limit = 12): Promise<BuyCandidate[]> {
    const rows = await this.db.query(
      `
      WITH dedup AS (
        SELECT DISTINCT
          t.company_id,
          t."transactionDate",
          t."pricePerShare",
          t."sharesBought",
          -- Joint filers report the same trade under different names. Keying on
          -- the trade itself (date, price, size) collapses them to one row; the
          -- name kept is whichever sorts first, which is stable run to run.
          MIN(t."insiderName") AS insider,
          MIN(t.role) AS role
        FROM insider_transactions t
        JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t."transactionDate" >= CURRENT_DATE - $1::int
          AND ${plausibleTxSql('t', 'c')}
        GROUP BY 1,2,3,4
      )
      SELECT c.ticker, c.name, c.sector, c."marketCap"::float8 AS "marketCap",
             c."lastPrice"::float8 AS "lastPrice",
             d.insider, d.role, MAX(d."transactionDate")::date::text AS date,
             SUM(d."sharesBought")::float8 AS shares,
             SUM(d."sharesBought" * d."pricePerShare")::float8 AS value,
             COUNT(*)::int AS filings,
             MIN(d."pricePerShare")::float8 AS "minPrice",
             MAX(d."pricePerShare")::float8 AS "maxPrice"
      FROM dedup d JOIN companies c ON c.id = d.company_id
      GROUP BY 1,2,3,4,5,6,7
      ORDER BY value DESC
      LIMIT $2::int`,
      [sinceDays, limit],
    );
    return rows.map((r: any) => ({
      kind: 'single-buy' as const,
      ticker: String(r.ticker || '').split(',')[0],
      company: r.name,
      sector: r.sector,
      who: r.insider,
      role: r.role,
      date: r.date,
      value: Number(r.value),
      shares: Number(r.shares),
      facts: {
        filings: Number(r.filings),
        priceRange: [Number(r.minPrice), Number(r.maxPrice)],
        lastPrice: r.lastPrice == null ? null : Number(r.lastPrice),
        marketCap: r.marketCap == null ? null : Number(r.marketCap),
        tickerRaw: r.ticker,
      },
    }));
  }

  /** Companies where several different insiders bought in the same window. */
  async clusterBuys(sinceDays = 10, limit = 10): Promise<BuyCandidate[]> {
    const rows = await this.db.query(
      `
      WITH dedup AS (
        SELECT DISTINCT t.company_id, t."transactionDate", t."pricePerShare",
               t."sharesBought", MIN(t."insiderName") AS insider, MIN(t.role) AS role
        FROM insider_transactions t
        JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t."transactionDate" >= CURRENT_DATE - $1::int
          AND ${plausibleTxSql('t', 'c')}
        GROUP BY 1,2,3,4
      )
      SELECT c.ticker, c.name, c.sector, c."lastPrice"::float8 AS "lastPrice",
             COUNT(DISTINCT d.insider)::int AS buyers,
             SUM(d."sharesBought" * d."pricePerShare")::float8 AS value,
             MAX(d."transactionDate")::date::text AS date,
             STRING_AGG(DISTINCT d.insider, ' | ') AS who
      FROM dedup d JOIN companies c ON c.id = d.company_id
      GROUP BY 1,2,3,4
      HAVING COUNT(DISTINCT d.insider) >= 2
      ORDER BY value DESC
      LIMIT $2::int`,
      [sinceDays, limit],
    );
    return rows.map((r: any) => ({
      kind: 'cluster-buy' as const,
      ticker: String(r.ticker || '').split(',')[0],
      company: r.name,
      sector: r.sector,
      who: String(r.who || '').split(' | ')[0],
      role: null,
      date: r.date,
      value: Number(r.value),
      shares: null,
      buyers: Number(r.buyers),
      facts: { allBuyers: String(r.who || '').split(' | '), lastPrice: r.lastPrice == null ? null : Number(r.lastPrice) },
    }));
  }

  /** Recent disclosed purchases by members of Congress. */
  async politicianBuys(sinceDays = 21, limit = 10): Promise<BuyCandidate[]> {
    try {
      const rows = await this.db.query(
        `SELECT ticker, "companyName", "politicianName", party, chamber, "photoUrl",
                "transactionDate"::date::text AS date, "reportedDate"::date::text AS reported,
                "amountMin"::float8 AS low, "amountMax"::float8 AS high
         FROM congressional_transactions
         WHERE action ILIKE 'buy%'
           AND "transactionDate" >= CURRENT_DATE - $1::int
         ORDER BY "amountMax" DESC NULLS LAST, "transactionDate" DESC
         LIMIT $2::int`,
        [sinceDays, limit],
      );
      return rows.map((r: any) => ({
        kind: 'politician' as const,
        ticker: String(r.ticker || '').toUpperCase(),
        company: r.companyName || r.ticker,
        sector: null,
        who: r.politicianName,
        role: [r.chamber, r.party].filter(Boolean).join(' '),
        date: r.date,
        // Congress discloses a BAND, never a number. The midpoint only orders
        // the list; the article must quote the band itself.
        value: (Number(r.low || 0) + Number(r.high || 0)) / 2,
        shares: null,
        facts: {
          amountLow: Number(r.low || 0),
          amountHigh: Number(r.high || 0),
          band: true,
          reported: r.reported,
          // The congress feed carries an official portrait for most members,
          // which is exactly the real photograph a person cover needs.
          photoUrl: r.photoUrl || null,
        },
      }));
    } catch (e: any) {
      this.logger.warn(`politician buys unavailable: ${e.message}`);
      return [];
    }
  }
}
