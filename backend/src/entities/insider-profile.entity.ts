import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Insider Pedigree / Litigation profile (IQ Score v2.1 spec §6.3, §7).
 *
 * One row per researched insider. The spec's canonical person key is the
 * SEC reporting-person CIK; our Form 4 ingest doesn't persist that yet, so
 * `nameKey` (lowercased insider name as filed) is the join key to
 * insider_transactions, with `cik` stored for when ingest catches up.
 *
 * Compliance (spec §7.4): every flag/matter must carry evidence (source URL,
 * quote, retrieval date) and reviewer identity — flags without review only
 * affect scores when autoApproved (confidence ≥ 0.9 path). Ambiguous entity
 * matches must NOT be written here at all.
 */
@Entity('insider_profiles')
export class InsiderProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Lowercased insider name exactly as it appears on Form 4 filings. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  nameKey!: string;

  /** SEC reporting-person CIK when known — the spec's canonical key. */
  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  cik!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName!: string | null;

  /** Reviewed pedigree flag keys (spec §6.1), e.g. ["major_exit","billionaire"].
   *  JSON array. Only flags present here affect scores. */
  @Column({ type: 'text', default: '[]' })
  flags!: string;

  /** Litigation matters (spec §7): JSON array of
   *  { tier, status, resolvedYearsAgo?, noDecay?, caption?, source?, evidenceId? } */
  @Column({ type: 'text', default: '[]' })
  litigationMatters!: string;

  /** Evidence records for every flag/matter: JSON array of
   *  { key, sourceUrl, quote, retrievedAt, confidence } — spec §7.4 provenance. */
  @Column({ type: 'text', default: '[]' })
  evidence!: string;

  /** Analyst who confirmed the flags (spec §6.3 step 4); null = auto-applied. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  reviewedBy!: string | null;

  /** Suppress switch — correction workflow (spec §7.4.3): true removes this
   *  profile from scoring immediately without deleting the audit trail. */
  @Column({ type: 'boolean', default: false })
  suppressed!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
