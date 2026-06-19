import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A company's earnings report date. Accumulated over time from the Nasdaq
 * calendar (and the upcoming feed as dates roll into the past), so the
 * earnings-performance backtest reads from a stable, growing local table
 * instead of re-scraping a full year on every run (which Nasdaq throttles).
 */
@Entity('earnings_events')
@Index(['ticker', 'reportDate'], { unique: true })
export class EarningsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  ticker: string;

  /** Report date, ISO yyyy-mm-dd. */
  @Index()
  @Column({ type: 'date' })
  reportDate: string;

  @Column({ type: 'varchar', length: 16, default: 'nasdaq' })
  source: string;

  @CreateDateColumn()
  createdAt: Date;
}
