import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Cached federal-contract totals per public contractor, refreshed from the
 *  free USAspending.gov API a slice at a time (cloud cron). The list endpoint
 *  reads these rows and enriches them with live analyst ratings + quotes. */
@Entity('gov_contract_cache')
export class GovContractCache {
  @PrimaryColumn({ type: 'varchar', length: 12 })
  ticker!: string;

  @Column({ type: 'varchar', length: 200 })
  recipientName!: string;

  /** Trailing-12-month obligated federal contract dollars. numeric → string. */
  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  ttmAmount!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  topAgency!: string | null;

  /** Whether USAspending returned any award activity (false = no match/none). */
  @Column({ type: 'boolean', default: false })
  hasData!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;
}
