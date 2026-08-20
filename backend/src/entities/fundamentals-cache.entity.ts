import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Per-symbol fundamentals that only exist behind per-symbol endpoints on the
 *  request path, refreshed in bulk from two FMP feeds:
 *
 *    `shares-float-all`          → floatShares / outstandingShares / freeFloatPct
 *    `price-target-summary-bulk` → ptCount / ptAvgTarget
 *
 *  Why a table (same story as pe_ratio_cache): the analyst-target column on
 *  every list page came from Yahoo's per-symbol quoteSummary inside a ~3.5s
 *  request budget, so most rows never got a target and rendered em-dashes.
 *  Short-interest float had the same shape. Both bulk feeds answer for every
 *  symbol in one call, so the fetch moves off the request path entirely and
 *  the read is one indexed query.
 *
 *  Columns are nullable per feed: each refresh pass upserts only the columns
 *  its own feed carries, so one failed feed can never blank the other's data. */
@Entity('fundamentals_cache')
export class FundamentalsCache {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  symbol!: string;

  /** Tradable float, in shares. bigint → string in TypeORM. */
  @Column({ type: 'bigint', nullable: true })
  floatShares!: string | null;

  @Column({ type: 'bigint', nullable: true })
  outstandingShares!: string | null;

  /** Float as a PERCENT of shares outstanding (41.4 = 41.4%). */
  @Column({ type: 'numeric', precision: 9, scale: 4, nullable: true })
  freeFloatPct!: string | null;

  /** How many analyst price targets the average below is built from. */
  @Column({ type: 'int', nullable: true })
  ptCount!: number | null;

  /** Average analyst price target, most recent non-empty window (month →
   *  quarter → year) — an all-time average would mix in decade-old targets. */
  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  ptAvgTarget!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
