import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InsiderTransaction } from './insider-transaction.entity';
import { IqsScore } from './iqs-score.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  cik: string;

  @Index()
  @Column({ type: 'varchar', length: 16, nullable: true })
  ticker: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'bigint', nullable: true })
  marketCap: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  lastPrice: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sector: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => InsiderTransaction, (t) => t.company)
  transactions: InsiderTransaction[];

  @OneToMany(() => IqsScore, (s) => s.company)
  scores: IqsScore[];
}
