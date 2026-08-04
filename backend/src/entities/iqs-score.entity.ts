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

  /** Composite Insider Quality Score, 0–100. In v2 this is the 5-component
   *  weighted composite (Buying·0.50 + Sector·0.25 + MD&A·0.10 + Momentum·0.10
   *  + Dilution·0.05); see scoring-config.ts. */
  @Index()
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  iqs: number;

  /** The previous (v1) insider-only score — log(1 + A+B+C+D) scaled to 0–99 —
   *  kept alongside the v2 composite (`iqs`) for side-by-side comparison. */
  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  iqsV1: number | null;

  // ── IQ Score v2 components (each 0–100, null when no data) ──────────────
  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  buyingScore: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  sectorSentiment: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  mdaSentiment: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  momentumScore: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  dilutionScore: number | null;

  /** Share of model weight that had data (0–1) — confidence hint. */
  @Column({ type: 'numeric', precision: 6, scale: 4, default: 1 })
  dataCompleteness: number;

  // ── Buying sub-factors (0–100, null when no data) — explainability ──────
  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subVolumeVsMcap: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subCluster: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subRole: number | null;

  /** D — Stake Increase: the merged holding-change + ownership-increase
   *  metric (role-weighted relative stake growth, capped at doubling). */
  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subHoldingChange: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subPriceVsBuys: number | null;

  /** Retired — merged into subHoldingChange (Stake Increase); always null on
   *  new rows. Kept so old rows/readers don't break. */
  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subOwnershipPct: number | null;

  @Column({ type: 'int', default: 0 })
  distinctBuyers: number;

  @Column({ type: 'int', default: 0 })
  transactionCount: number;

  @Column({ type: 'numeric', precision: 24, scale: 4, default: 0 })
  totalPurchaseValue: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
