import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Long-horizon open-market insider purchases (10 years, via FMP's per-symbol
 * insider-trading history) — the backtest's event source. Kept separate from
 * insider_transactions so a decade of history never pollutes the product's
 * 90-day scoring windows or the trades feed.
 */
@Entity('historical_insider_buys')
@Index(['symbol', 'transactionDate'])
@Index(['symbol', 'insiderName', 'transactionDate', 'totalValue'], { unique: true })
export class HistoricalInsiderBuy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  symbol: string;

  @Column({ type: 'varchar', length: 255 })
  insiderName: string;

  /** FMP typeOfOwner ("officer: CFO", "director", "10 percent owner", …). */
  @Column({ type: 'varchar', length: 160, nullable: true })
  typeOfOwner: string | null;

  @Column({ type: 'date' })
  transactionDate: Date;

  /** shares × price at filing. */
  @Column({ type: 'numeric', precision: 24, scale: 2 })
  totalValue: number;
}
