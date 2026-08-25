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

  // ── Portfolio Intelligence tier ($19/month, Round-2 brief Section 3) ──
  // A SEPARATE Stripe subscription from premium: it can stack on top of a
  // premium plan or be bought standalone, so it needs its own state.
  @Column({ type: 'varchar', length: 64, nullable: true })
  portfolioSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  portfolioStatus!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  portfolioCurrentPeriodEnd!: Date | null;

  /** E.164 number collected after the portfolio purchase, for SMS alerts. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  phone!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  phoneConfirmedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
