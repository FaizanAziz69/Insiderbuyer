import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stored lowercased + trimmed; unique. */
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name!: string | null;

  /** scrypt password hash, encoded as "scrypt$<saltHex>$<hashHex>". */
  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  // ── Stripe subscription state (mirrored from Stripe via webhook/sync) ──
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  stripeSubscriptionId!: string | null;

  /** Stripe subscription status: active | trialing | past_due | canceled | … */
  @Column({ type: 'varchar', length: 24, nullable: true })
  premiumStatus!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  premiumPlan!: 'monthly' | 'annual' | null;

  /** End of the paid period — premium is honoured until this instant. */
  @Column({ type: 'timestamptz', nullable: true })
  premiumCurrentPeriodEnd!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
