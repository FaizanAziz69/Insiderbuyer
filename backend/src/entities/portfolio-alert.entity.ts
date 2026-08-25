import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PortfolioAlertKind =
  | 'cluster-buy'
  | 'ceo-new-position'
  | 'pre-earnings'
  | 'conviction-fading';

/**
 * One row per SMS actually sent, so a signal is never texted twice. `dedupeKey`
 * is what makes an alert unique (e.g. the Form 4 accession number, or the
 * ticker + month for a slow-moving score change).
 */
@Entity('portfolio_alerts')
@Index(['userId', 'kind', 'dedupeKey'], { unique: true })
export class PortfolioAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  ticker!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: PortfolioAlertKind;

  @Column({ type: 'varchar', length: 120 })
  dedupeKey!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /** False when Twilio is not configured — the alert is logged, not sent. */
  @Column({ type: 'boolean', default: false })
  delivered!: boolean;

  @CreateDateColumn()
  sentAt!: Date;
}
