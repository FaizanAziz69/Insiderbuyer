import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('iqs_scores')
@Index(['company', 'asOfDate'], { unique: true })
export class IqsScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (c) => c.scores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  @Index()
  @Column({ type: 'date' })
  asOfDate: string;

  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  purchaseVolumeFactor: number;

  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  clusterFactor: number;

  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  roleWeightedVolume: number;

  @Column({ type: 'numeric', precision: 18, scale: 8, default: 0 })
  holdingChangeFactor: number;

  @Index()
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  iqs: number;

  @Column({ type: 'int', default: 0 })
  distinctBuyers: number;

  @Column({ type: 'int', default: 0 })
  transactionCount: number;

  @Column({ type: 'numeric', precision: 24, scale: 4, default: 0 })
  totalPurchaseValue: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
