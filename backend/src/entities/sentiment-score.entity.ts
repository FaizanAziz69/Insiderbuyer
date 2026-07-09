import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Cached news-sentiment score per ticker — the third composite-score pillar.
 * Computed from recent headlines (Yahoo news feed) scored by Claude, then
 * cached here so each ticker costs at most one model call per TTL window.
 */
@Entity('sentiment_scores')
export class SentimentScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  ticker: string;

  /** 0–100 sentiment score; null when there weren't enough headlines. */
  @Column({ type: 'int', nullable: true })
  score: number | null;

  /** How many headlines fed the score (freshness/confidence hint). */
  @Column({ type: 'int', default: 0 })
  headlineCount: number;

  /** One-line model rationale, for the score-explanation UI. */
  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
