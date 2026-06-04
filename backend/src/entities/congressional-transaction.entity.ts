import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Chamber = 'House' | 'Senate';
export type CongressAction = 'Buy' | 'Sell';

@Entity('congressional_transactions')
@Index(['ticker'])
@Index(['politicianName'])
@Index(['transactionDate'])
export class CongressionalTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  politicianName!: string;

  @Column({ type: 'varchar', length: 10 })
  chamber!: Chamber;

  @Column({ type: 'varchar', length: 30, nullable: true })
  party!: string | null;

  @Column({ type: 'varchar', length: 20 })
  ticker!: string;

  @Column({ type: 'varchar', length: 200 })
  companyName!: string;

  @Column({ type: 'varchar', length: 10 })
  action!: CongressAction;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  amountMin!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  amountMax!: number | null;

  @Column({ type: 'date' })
  transactionDate!: Date;

  @Column({ type: 'date', nullable: true })
  reportedDate!: Date | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  source!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
