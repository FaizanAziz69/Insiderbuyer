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

  // ── The four IQS factors (proposal §3), stored raw ────────────────
  //   transactionWeight = A (Purchase Volume)
  //   clusterWeight     = B (Cluster)
  //   insiderWeight     = C (Role-Weighted Volume)
  //   convictionWeight  = D (Holding Change)

  /** C — role-weighted purchase volume: Σ(shares × price × role mult) / market cap. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  insiderWeight: number;

  /** A — purchase volume: Σ(shares × price) / market cap. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  transactionWeight: number;

  /** D — holding change: Σ(shares / prev holdings × 100) / insiders who bought. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  convictionWeight: number;

  /** Legacy — no longer computed or written by the scorer (rows keep the
   *  column default). Kept only so old rows/readers don't break. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 50 })
  historicalSuccessWeight: number;

  /** B — cluster: ln(1 + distinct insider buyers). */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  clusterWeight: number;

  /** Legacy — no longer computed or written by the scorer (rows keep the
   *  column default). Kept only so old rows/readers don't break. */
  @Column({ type: 'numeric', precision: 18, scale: 8, default: 50 })
  marketTimingWeight: number;

  /** The site's 0–100 Insider Score: the percentile rank of iqsRaw across
   *  all companies scored in the same run (monotonic — ordering is exactly
   *  the raw formula's). Top company ≈ 99, median ≈ 50. */
  @Index()
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  iqs: number;

  /** Raw proposal value ln(1 + (A + B + C + D)) — the formula output that
   *  the 0–100 percentile above is derived from. See scoring-config.ts. */
  @Column({ type: 'numeric', precision: 18, scale: 8, nullable: true })
  iqsRaw: number | null;

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

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subHoldingChange: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  subPriceVsBuys: number | null;

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
