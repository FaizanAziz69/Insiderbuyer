import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Pre-composed payload for the Insider Bubbles Map — one row per time window
 * ('1d' … '1y'), each holding the full bubble set with all panel data joined.
 *
 * Why a table (same story as pe_ratio_cache): the map needs qualifying buy
 * events, per-window VWAIP, 90-day average prices, quotes, IQ scores, analyst
 * targets and TTM financials in ONE response. Composing that live would fan
 * out to FMP on the request path against a ~10s gateway; here the cron pays
 * that cost and the endpoint is a single primary-key read.
 */
@Entity('bubbles_cache')
export class BubblesCache {
  @PrimaryColumn({ type: 'varchar', length: 8 })
  window!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * Slow-moving per-ticker enrichment for the map (90-day average price,
 * company description, exchange, TTM revenue/net income). These need
 * per-symbol FMP calls, so they refresh on their own 24h clock and in
 * bounded batches — the 15-minute bubble refresh itself then costs only
 * SQL against tables we already keep fresh.
 */
@Entity('bubbles_ticker_meta')
export class BubblesTickerMeta {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  symbol!: string;

  /** Trailing 90-calendar-day average close — the color reference price. */
  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  avg90!: string | null;

  @Column({ type: 'text', nullable: true })
  about!: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  exchange!: string | null;

  @Column({ type: 'numeric', precision: 24, scale: 2, nullable: true })
  revenueTtm!: string | null;

  @Column({ type: 'numeric', precision: 24, scale: 2, nullable: true })
  netIncomeTtm!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
