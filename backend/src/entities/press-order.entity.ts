import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PressPackage = 'authority' | 'ultimate';
/** Brief v3 §6: Received → In Review → Approved → Published → Reported. */
export type PressOrderStatus = 'received' | 'in_review' | 'approved' | 'published' | 'reported';
export const PRESS_ORDER_STATUSES: PressOrderStatus[] = ['received', 'in_review', 'approved', 'published', 'reported'];

/**
 * A self-serve press-publishing order (Brief v3, press.insiderbuying.com).
 * Created when the Stripe Checkout session is verified paid; the intake form
 * fills company / ticker / press kit / contact; status is advanced from the
 * Editorial Desk admin queue.
 */
@Entity('press_orders')
export class PressOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  package!: PressPackage;

  @Column({ type: 'int' })
  amountCents!: number;

  @Column({ type: 'varchar', length: 8, default: 'usd' })
  currency!: string;

  /** Email Stripe collected at checkout — the order's identity. */
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  stripeSessionId!: string;

  @Column({ type: 'varchar', length: 16, default: 'received' })
  status!: PressOrderStatus;

  // ── Intake (Brief v3 §6: company, ticker, press kit or "write it for me", contact) ──
  @Column({ type: 'varchar', length: 200, nullable: true })
  company!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contactName!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  contactEmail!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  contactPhone!: string | null;

  @Column({ type: 'boolean', default: false })
  writeForMe!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pressKitFilename!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pressKitPath!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  pressKitMime!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** UTM / funnel attribution captured on the Get Started click (Brief v3 §7). */
  @Column({ type: 'jsonb', nullable: true })
  attribution!: Record<string, string> | null;

  @Column({ type: 'timestamptz', nullable: true })
  intakeCompletedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
