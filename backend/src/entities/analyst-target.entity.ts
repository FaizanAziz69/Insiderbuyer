import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One price-target note by a NAMED analyst, accumulated from FMP's
 * price-target-latest-news feed (the one per-analyst endpoint on our tier).
 *
 * The free tier serves only the 10 most recent notes per call with no history
 * or pagination, so — exactly like congressional disclosures — the dataset is
 * built by polling and upserting: every cron tick and throttled page request
 * adds whatever is new, and coverage deepens the longer the site runs.
 */
@Entity('analyst_price_targets')
@Index(['analystName', 'symbol', 'publishedDate'], { unique: true })
@Index(['publishedDate'])
export class AnalystPriceTarget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  analystName!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  analystCompany!: string | null;

  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  priceTarget!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  priceWhenPosted!: number | null;

  @Column({ type: 'timestamptz' })
  publishedDate!: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  newsURL!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  newsPublisher!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
