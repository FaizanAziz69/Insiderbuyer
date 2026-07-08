import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BlogKind =
  | 'daily-summary'
  | 'top-iqs'
  | 'ticker-deep-dive'
  | 'sector-roundup'
  | 'cluster-buy'
  | 'ceo-buying'
  | 'stock-idea'
  | 'weekly-report'
  | 'topic-roundup'
  | 'editorial';

@Entity('blog_posts')
@Index(['kind', 'generatedAt'])
@Index(['ticker'])
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  title: string;

  @Column()
  kind: BlogKind;

  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sector: string | null;

  /** Topic slug for news-topic roundups (ai, biotech, ev, etf, macro,
   *  markets, ma, semis). Null for non-topic posts. */
  @Index()
  @Column({ type: 'varchar', length: 40, nullable: true })
  topic: string | null;

  @Column({ type: 'text' })
  summary: string;

  /** Article body rendered as HTML — safe inline tags only (no <script>/<iframe>). */
  @Column({ type: 'text' })
  body: string;

  /** Prompt used to generate the cover image. Frontend resolves to a CDN URL. */
  @Column({ type: 'text', nullable: true })
  imagePrompt: string | null;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  iqsAtGeneration: number | null;

  @Column({ type: 'jsonb', nullable: true })
  tags: string[] | null;

  /** Tickers we surface as a brand-logo overlay band on the cover image —
   *  MarketBeat-style. Single-ticker posts get [ticker]; multi-ticker posts
   *  (top-iqs, daily-summary, sector-roundup) get the top 2-3 by Insider Score. */
  @Column({ type: 'jsonb', nullable: true })
  featuredTickers: string[] | null;

  /** Eyebrow label rendered above the headline ("DAILY BRIEFING", "TICKER FOCUS"). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  eyebrow: string | null;

  /** Snapshot of the input data used to generate the post (rankings, tx ids, etc.).
   * Useful for debugging + showing the user what data backed the article. */
  @Column({ type: 'jsonb', nullable: true })
  inputSnapshot: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn()
  generatedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
