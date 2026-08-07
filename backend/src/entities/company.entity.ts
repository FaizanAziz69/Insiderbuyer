import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InsiderTransaction } from './insider-transaction.entity';
import { IqsScore } from './iqs-score.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  cik: string;

  @Index()
  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'bigint', nullable: true })
  marketCap: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  lastPrice: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sector: string;

  /** Finer-grained Yahoo industry (e.g. "Gold", "Semiconductors", "Oil & Gas
   *  Integrated"). Populated for non-US listings where the broad `sector` is
   *  too coarse for the sector-list keyword rules to match. */
  @Column({ type: 'varchar', length: 96, nullable: true })
  industry: string | null;

  /** Listing exchange group used by the "Exchanges" filter (All / U.S. /
   *  Canada / Germany). SEC-ingested companies default to 'US'; BaFin
   *  directors'-dealings ingestion tags German issuers 'DE'. */
  @Index()
  @Column({ type: 'varchar', length: 8, default: 'US' })
  exchange: string;

  // ── IQ Score v2 precomputed inputs (populated out-of-band, read by the
  //    batch scorer which can't afford a per-company SEC/LLM call) ─────────

  /** Trailing-12-month share-count growth (0.06 = +6% dilution; ≤0 = buyback).
   *  From SEC XBRL dei:EntityCommonStockSharesOutstanding. */
  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true })
  dilutionPctTtm: number | null;

  /** Real shares outstanding from SEC XBRL — the §2G denominator (replaces
   *  the marketCap ÷ price proxy when present). */
  @Column({ type: 'numeric', precision: 24, scale: 0, nullable: true })
  sharesOutstanding: number | null;

  /** MD&A / company-communications sentiment, 0–100 (50 = neutral). Populated
   *  by the MD&A NLP batch; read by the composite scorer. */
  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  mdaSentiment: number | null;

  /** How many documents backed the MD&A score (explainability / completeness). */
  @Column({ type: 'int', default: 0 })
  mdaDocsAnalyzed: number;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => InsiderTransaction, (t) => t.company)
  transactions: InsiderTransaction[];

  @OneToMany(() => IqsScore, (s) => s.company)
  scores: IqsScore[];
}
