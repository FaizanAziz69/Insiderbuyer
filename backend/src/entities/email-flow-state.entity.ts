import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmailFlowName = 'welcome' | 'abandoned' | 'post_purchase' | 'discount';

/** One recipient's progress through one email flow. The scheduler walks
 *  active rows, sends every step whose offset has elapsed and isn't in
 *  sentSteps yet, and marks the row completed when all steps are sent. */
@Entity('email_flow_states')
@Index(['email', 'flow'], { unique: true })
export class EmailFlowState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  firstName!: string | null;

  @Column({ type: 'varchar', length: 32 })
  flow!: EmailFlowName;

  /** The flow clock starts here (signup / abandonment / purchase time). */
  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  /** JSON array of step ids already sent, e.g. ["w1","w2"]. */
  @Column({ type: 'text', default: '[]' })
  sentSteps!: string;

  /** active | completed | cancelled */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
