import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Closing price of every U.S.-listed symbol on ONE date, from FMP's bulk
 * `batch-eod` feed (one call returns the whole market for that day).
 *
 * Why a table: the Hot Sectors breadth factor needs each member's close on the
 * last trading day of the previous month (and of the previous year, for YTD).
 * That used to be one Yahoo chart request per symbol, cached in process — which
 * capped a basket at 75 members and re-fetched everything after each restart.
 * Two bulk rows-per-date sets cover every listed company for the whole month,
 * so a sector can hold every qualifying stock rather than the largest 75.
 */
@Entity('eod_closes')
export class EodClose {
  /** ISO date, YYYY-MM-DD. */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  date!: string;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  close!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
