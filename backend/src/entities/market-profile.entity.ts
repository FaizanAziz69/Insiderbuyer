import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Per-symbol market snapshot from FMP's `profile-bulk` feed — price, day
 * change, volume, market cap, sector and industry for the whole universe in
 * ONE call.
 *
 * Why this exists: the movers tables and both heatmaps are built by scraping
 * Yahoo (cookie+crumb handshake, forced IPv4, a fallback list per screener),
 * which is unlicensed and breaks whenever Yahoo rotates its crumb. Measured
 * 2026-08-13, `profile-bulk` returns 22,799 rows in ~17s with price, change,
 * volume, cap, sector and industry ALL populated, and its prices match live
 * `batch-quote` exactly — so one refresh replaces the scraping for every
 * market-wide list.
 *
 * Rows are refreshed in bulk and read straight off this table, so the pages
 * stop paying a network round trip per request.
 */
@Entity('market_profile_snapshot')
export class MarketProfileSnapshot {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  symbol!: string;

  @Column({ type: 'varchar', length: 220, default: '' })
  name!: string;

  /** numeric → string in TypeORM; the read path converts. */
  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  price!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  changeAbs!: string | null;

  /** Day change in percent. Indexed: the movers tables sort on it. */
  @Index()
  @Column({ type: 'numeric', precision: 14, scale: 6, nullable: true })
  changePct!: string | null;

  @Column({ type: 'bigint', nullable: true })
  volume!: string | null;

  @Column({ type: 'bigint', nullable: true })
  avgVolume!: string | null;

  /** Indexed: the universe is ordered by cap nearly everywhere. */
  @Index()
  @Column({ type: 'numeric', precision: 24, scale: 2, nullable: true })
  marketCap!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sector!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  industry!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  exchange!: string | null;

  /** Parsed from the feed's "low-high" range string. */
  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  fiftyTwoWeekLow!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  fiftyTwoWeekHigh!: string | null;

  /** Most recent declared dividend per share — the annual rate column. */
  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  lastDividend!: string | null;

  /** Kept so a caller can exclude funds without re-reading the screener. */
  @Column({ type: 'boolean', default: false })
  isFundLike!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;
}
