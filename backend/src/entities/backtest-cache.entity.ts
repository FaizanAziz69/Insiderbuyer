import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Daily closes for one symbol, persisted so the backtest can be assembled
 * across several requests.
 *
 * On serverless the instance freezes the moment a response is sent, so a
 * background sweep never finishes and in-memory caches die with the instance.
 * Persisting each symbol's history lets every request fetch a small slice and
 * hand the rest to the next one.
 */
@Entity('price_history_cache')
export class PriceHistoryCache {
  @PrimaryColumn({ type: 'varchar', length: 24 })
  symbol!: string;

  /** Ascending [{ t: epoch-ms, c: close }]. */
  @Column({ type: 'jsonb' })
  points!: Array<{ t: number; c: number }>;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** The computed backtest, so a cold instance serves it without recomputing. */
@Entity('backtest_cache')
export class BacktestCache {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @UpdateDateColumn()
  computedAt!: Date;
}
