import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('iqs_scores')
@Index(['company', 'asOfDate'], { unique: true })
export class IqsScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (c) => c.scores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  @Index()
  @Column({ type: 'date' })
  asOfDate: string;

  // ── The six IQS components (each 0–100) ──────────────────────────
  // IQS = Insider×0.25 + Transaction×0.25 + Conviction×0.20
  //     + HistoricalSuccess×0.15 + Cluster×0.10 + MarketTiming×0.05

  /** Who bought — CEO/CFO buys score highest. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  insiderWeight: number;

  /** How big — dollar size, absolute and relative to market cap. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  transactionWeight: number;

  /** Conviction — stake increase % and repeat buying. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  convictionWeight: number;

  /** Track record — share of past insider buys currently in profit. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 50 })
  historicalSuccessWeight: number;

  /** Cluster — number of distinct insiders buying together. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  clusterWeight: number;

  /** Market timing — buying near 52-week lows scores highest. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 50 })
  marketTimingWeight: number;

  /** Composite Insider Quality Score, 0–100. */
  @Index()
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  iqs: number;

  @Column({ type: 'int', default: 0 })
  distinctBuyers: number;

  @Column({ type: 'int', default: 0 })
  transactionCount: number;

  @Column({ type: 'numeric', precision: 24, scale: 4, default: 0 })
  totalPurchaseValue: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
