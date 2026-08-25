import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A stock the user says they own (Round-2 brief, Section 3: "Add the stocks
 * you own"). Server-side on purpose — the alert engine has to know who holds
 * what, which a device-local watchlist can never tell it.
 */
@Entity('portfolio_holdings')
@Index(['userId', 'ticker'], { unique: true })
export class PortfolioHolding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  ticker!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
