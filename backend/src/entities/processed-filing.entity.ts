import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_filings')
export class ProcessedFiling {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  accessionNumber: string;

  @Column({ type: 'int', default: 0 })
  qualifyingTransactions: number;

  @CreateDateColumn()
  processedAt: Date;
}
