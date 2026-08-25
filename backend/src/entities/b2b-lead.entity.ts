import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A discovery-call request from the B2B site (Round-2 brief, Section 4D:
 * "Contact form alternative: Name, Company, Ticker (if listed), Email, Phone,
 * Message. Submits to CRM tagged as 'B2B Lead'.").
 */
@Entity('b2b_leads')
export class B2bLead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  company!: string | null;

  /** Ticker, when the company is listed. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  /** CRM tag, per the brief. */
  @Column({ type: 'varchar', length: 40, default: 'B2B Lead' })
  source!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
