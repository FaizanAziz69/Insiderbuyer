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

  // ── Influence & contract evidence (Brief v9 §6 "Influence" group) ──────
  @Column({ type: 'jsonb', nullable: true })
  committees: string[] | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  highestRole: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  contractValue12m: number | null;

  @Column({ type: 'int', default: 0 })
  contractCount12m: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  bestCtsScore: number | null;

  /** Top awarding federal agency for this company, where we hold contract data. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  topAgency: string | null;

  /**
   * The corporate Insider Score for the same stock, 90-day — Brief v9 §6 lists
   * it as its own free column next to CQS, and it is what the insider-overlap
   * multiplier reads. Stored so the board can show a number rather than only a
   * flag that is off for every row.
   */
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  iqs: number | null;

  // ── Buyers (Brief v9 §6 "Congress activity" group) ────────────────────
  /** One entry per distinct member: name, party, chamber, grade, dollars, photo. */
  @Column({ type: 'jsonb', nullable: true })
  buyers: Array<{
    name: string;
    party: string | null;
    chamber: string | null;
    grade: string | null;
    estValue: number;
    largestBand: number;
    photoUrl: string | null;
  }> | null;

  // ── Timing (Brief v9 §6 "Timing" group) ───────────────────────────────
  @Column({ type: 'date', nullable: true })
  firstBuyDate: string | null;

  @Column({ type: 'date', nullable: true })
  lastBuyDate: string | null;

  @Column({ type: 'date', nullable: true })
  lastFilingDate: string | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  avgFilingLagDays: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  maxFilingLagDays: number | null;

  // ── Market context ────────────────────────────────────────────────────
  /** Percent below the 52-week high, negative (feeds the contrarian multiplier). */
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  pctVs52wHigh: number | null;

  /** Multipliers that could not be evaluated for this row — never shown as "did not fire". */
  @Column({ type: 'jsonb', nullable: true })
  multipliersUnavailable: string[] | null;

  /** Mean ROI across the qualifying buys, from each buy's transaction date. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  avgClusterRoiPct: number | null;

  /** Estimated dollar P&L: band midpoint x ROI, summed (est.). */
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  estPnlUsd: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
