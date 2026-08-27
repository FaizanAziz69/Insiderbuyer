import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One AI story pitch from the Editorial Playbook v2 §2 discovery run.
 *
 * The manual describes this as an n8n/Make workflow emailing a briefing. It
 * lives in the backend instead, for the same reason the alert switch does: the
 * data feeds it cross-references (our Form 4 ingest, the movers table, the
 * news fetcher) are already here, and a pitch that references our own coverage
 * cannot be built from outside it. The briefing is a table read by the
 * Editorial Desk page, not an email attachment.
 *
 * Rows are kept, not overwritten: the same ticker can be pitched on several
 * days, and "we pitched this on the 12th and skipped it" is editorial history
 * worth having.
 */
// ONE index declaration per column set. A class-level `@Index(['runAt'])`
// alongside a property-level `@Index()` on the same column generates the SAME
// deterministic index name twice, and TypeORM emits both inside the CREATE
// TABLE — the second one fails with `relation "IDX_…" already exists`, which
// aborts `synchronize()` and puts the whole backend into a boot crash loop
// (hit in production 2026-08-27). The composite index covers `runAt` lookups
// as a prefix, so `ticker, runAt` plus the single `runAt` below is all that is
// needed.
@Entity('story_pitches')
@Index(['ticker', 'runAt'])
export class StoryPitch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Discovery run this pitch belongs to — an ISO timestamp shared by every
   *  pitch from the same sweep, so the UI can group one briefing. Indexed
   *  here and NOT also at class level — see the note above the decorator. */
  @Index()
  @Column({ type: 'timestamptz' })
  runAt: Date;

  /** 1 = appears in the Form 4 feed AND (movers OR news). 2 = one feed only.
   *  3 = no single-ticker signal; a sector/macro candidate. */
  @Column({ type: 'int', default: 2 })
  priority: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker: string | null;

  @Column({ type: 'varchar', length: 255 })
  companyName: string;

  /** The signals that flagged this candidate, in the manual's own wording
   *  ("CEO filed $2.1M open-market purchase on Aug 21"). */
  @Column({ type: 'jsonb' })
  signals: string[];

  /** §2 pitch fields, as returned by the model. */
  @Column({ type: 'text' })
  headline: string;

  @Column({ type: 'text' })
  lede: string;

  @Column({ type: 'text' })
  insiderAngle: string;

  @Column({ type: 'text' })
  watchFor: string;

  /** Which of the six §7 viz types fits this story. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  suggestedViz: string | null;

  /** §9 category tag the pitch belongs under. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  category: string | null;

  /** The raw facts handed to the model, kept so a writer can audit the pitch
   *  and so a wrong number can be traced to the feed that supplied it. */
  @Column({ type: 'jsonb', nullable: true })
  facts: Record<string, unknown> | null;

  /** Editorial disposition — set from the Desk when a writer takes or kills a
   *  pitch. 'open' until someone decides. */
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: 'open' | 'writing' | 'published' | 'passed';

  /** Slug of the article this pitch became, once published. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  publishedSlug: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
