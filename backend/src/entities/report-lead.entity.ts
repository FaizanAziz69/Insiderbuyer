import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * An opt-in from the standalone "Insider Quality Score" landing page: someone
 * asked for the insider report on a specific stock, by email or SMS.
 *
 * Delivery is deferred — no email/SMS provider is configured yet, so every
 * lead is stored as 'pending' and the report can be rendered on demand at
 * /report-requests/:id/preview. When a provider key lands, a sender walks
 * the pending rows and flips status to 'sent'.
 */
@Entity('report_leads')
@Index(['contact', 'ticker'])
export class ReportLead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  ticker!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  companyName!: string | null;

  /** Email address or phone number, depending on channel. */
  @Column({ type: 'varchar', length: 320 })
  contact!: string;

  @Column({ type: 'varchar', length: 8 })
  channel!: 'email' | 'sms';

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: 'pending' | 'sent' | 'failed';

  @Column({ type: 'varchar', length: 80, nullable: true })
  source!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
