import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per Form 4 purchase that has already gone out in an IQS Alert email.
 *
 * The hourly sweep looks back a full day and skips anything recorded here, so a
 * restart, a retry or an overlapping run can never mail the same filing twice —
 * and a missed hour still gets picked up on the next pass.
 */
@Entity('insider_alert_dispatch')
@Index(['transactionId', 'channel'], { unique: true })
export class InsiderAlertDispatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** insider_transactions.id — half of the deduplication key. */
  @Column({ type: 'uuid' })
  transactionId!: string;

  /** Who this filing went to: 'broadcast' for the public IQS Alert digest, or
   *  a user id for a watchlist alert. A filing can legitimately reach both, so
   *  uniqueness is per (filing, channel) rather than per filing. */
  @Column({ type: 'varchar', length: 64, default: 'broadcast' })
  channel!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker!: string | null;

  /** IQS at send time, so the email and the record agree afterwards. */
  @Column({ type: 'int', nullable: true })
  iqs!: number | null;

  /** How many inboxes this filing was mailed to. */
  @Column({ type: 'int', default: 0 })
  recipients!: number;

  @CreateDateColumn()
  sentAt!: Date;
}
