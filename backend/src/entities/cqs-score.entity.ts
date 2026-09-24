import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cqs_scores')
@Index(['ticker', 'asOfDate', 'windowDays'], { unique: true })
export class CqsScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  ticker: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  companyName: string;

  @Index()
  @Column({ type: 'date' })
  asOfDate: string;

  @Column({ type: 'int', default: 90 })
  windowDays: number;

  /** Final Congress Quality Score, 0–100. */
  @Index()
  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  cqs: number;

  /** Grade: 'A+' | 'A' | 'B+' | 'B' | 'C' */
  @Index()
  @Column({ type: 'varchar', length: 8, default: 'C' })
  grade: string;

  /** True when grade is 'A' or 'A+' (CQS >= 80) — earns the gold ring tier. */
  @Index()
  @Column({ type: 'boolean', default: false })
  isGoldRing: boolean;

  // ── Eight CQS Components (each 0–100) ──────────────────────────────────
  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c1ClusterBreadth: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c2PositionSize: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c3CommitteeInfluence: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c4ContractAlignment: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c5BuyerTrackRecord: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c6RelativeConviction: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  c7Freshness: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 100 })
  c8NetDirection: number;

  // ── Multipliers Applied ───────────────────────────────────────────────
  @Column({ type: 'numeric', precision: 6, scale: 3, default: 1.0 })
  multiplierInsiderOverlap: number;

  @Column({ type: 'numeric', precision: 6, scale: 3, default: 1.0 })
  multiplierLegislativeCatalyst: number;

  @Column({ type: 'numeric', precision: 6, scale: 3, default: 1.0 })
  multiplierContrarianEntry: number;

  @Column({ type: 'numeric', precision: 6, scale: 3, default: 1.0 })
  multiplierLiquidityNorm: number;

  @Column({ type: 'numeric', precision: 6, scale: 3, default: 1.0 })
  multiplierFilingLag: number;

  // ── Activity & Portfolio Metrics ──────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  distinctMembers: number;

  @Column({ type: 'boolean', default: false })
  isBipartisan: boolean;

  @Column({ type: 'jsonb', nullable: true })
  partyCounts: { R: number; D: number; I: number } | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalEstBuyValue: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  largestSingleBand: string | null;

  @Column({ type: 'int', default: 0 })
  buyCount: number;

  @Column({ type: 'int', default: 0 })
  sellCount: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  tradeRoiPct: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  sinceFilingRoiPct: number | null;

  @Column({ type: 'boolean', default: false })
  hasLateFiling: boolean;

  @Column({ type: 'numeric', precision: 6, scale: 3, default: 1.0 })
  dataCompleteness: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sector: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  marketCap: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true })
  lastPrice: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
