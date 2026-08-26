import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Operator switches that must be flippable at runtime.
 *
 * Email sending in particular cannot live only in the server's .env: when the
 * client asked for every queued email stopped immediately (2026-08-25), the
 * only lever was an env edit plus a restart. A row in the database can be
 * turned off through an admin call in seconds, and survives deploys.
 */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'varchar', length: 255 })
  value!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
