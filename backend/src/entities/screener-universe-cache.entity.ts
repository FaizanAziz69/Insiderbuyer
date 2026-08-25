import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The screener's stock universe, stored as one row.
 *
 * The universe is a single 10,000-row FMP `company-screener` call. Keeping the
 * last good snapshot in the database means a restart, an FMP outage or a cold
 * start serves the full universe immediately instead of an empty screener —
 * the same reason the Hot Sectors snapshot lives in a table.
 */
@Entity('screener_universe_cache')
export class ScreenerUniverseCache {
  /** Single row. */
  @PrimaryColumn({ type: 'varchar', length: 16 })
  key!: string;

  /** Trimmed universe rows — see ScreenerService.UniverseRow. */
  @Column({ type: 'jsonb' })
  rows!: unknown;

  @Column({ type: 'int' })
  count!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
