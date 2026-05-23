import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from './company.entity';

export type InsiderRole = 'CEO' | 'CFO' | 'COO' | 'Director' | 'Other';

@Entity('insider_transactions')
@Index(['company', 'transactionDate'])
@Index(['accessionNumber', 'lineNumber'], { unique: true })
export class InsiderTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (c) => c.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ type: 'varchar', length: 255 })
  insiderName: string;

  @Column({ type: 'varchar', length: 32, default: 'Other' })
  role: InsiderRole;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rawTitle: string;

  @Column({ type: 'date' })
  transactionDate: Date;

  @Column({ type: 'varchar', length: 8 })
  transactionCode: string;

  @Column({ type: 'numeric', precision: 24, scale: 4 })
  sharesBought: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  pricePerShare: number;

  @Column({ type: 'numeric', precision: 24, scale: 4 })
  totalValue: number;

  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  previousHoldings: number;

  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  postHoldings: number;

  @Column({ type: 'varchar', length: 64 })
  accessionNumber: string;

  @Column({ type: 'int', default: 0 })
  lineNumber: number;

  @Column({ type: 'text', nullable: true })
  filingUrl: string;

  @CreateDateColumn()
  createdAt: Date;
}
