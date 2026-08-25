import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Earnings Alignment Index, one row per ticker.
 *
 * EAI answers the question the /earnings page promises: of this company's last
 * three STRONG quarters (an EPS beat), how many did insiders buy ahead of, in
 * the 30 days before the report? 3-of-3 is the flag; the score is the share.
 *
 * Cached in a table rather than in memory because the inputs are one FMP call
 * per symbol — a restart must not cost the whole calendar's worth of calls,
 * and a stale score is far better than a blank column.
 */
@Entity('eai_cache')
export class EaiCache {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  ticker!: string;

  /** 0–100: aligned strong quarters ÷ strong quarters examined. */
  @Column({ type: 'int' })
  eai!: number;

  /** How many of the last three strong quarters had pre-earnings insider buying. */
  @Column({ type: 'int' })
  aligned!: number;

  /** How many strong quarters we could examine (≤ 3). */
  @Column({ type: 'int' })
  strong!: number;

  /** Per-quarter detail: [{ date, epsActual, epsEstimated, bought, buyValue }]. */
  @Column({ type: 'jsonb' })
  quarters!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;
}
