import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A request for access to one of the B2B promoter datasets (George
 * 2026-09-21: "The Promoter Scores and top IR promoters data sets are not
 * available for purchase. They do not get unlocked with any subscription.
 * Instead, put a Request Access gate").
 *
 * The four fields George specified are the whole form. Approval mints an
 * access token that is emailed to the COMPANY address on the request — never
 * shown in the browser — so the person who receives the data is the person
 * whose work address was vetted.
 */
@Entity('data_access_requests')
@Index(['companyEmail', 'dataset'])
@Index(['token'])
export class DataAccessRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Which dataset was asked for: 'promoter-score', 'top-ir-promoters', or
   *  'both' when the visitor asked from a page that covers the pair. */
  @Column({ type: 'varchar', length: 32 })
  dataset!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 160 })
  company!: string;

  @Column({ type: 'varchar', length: 320 })
  companyEmail!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: 'pending' | 'approved' | 'declined';

  /** Minted on approval; the visitor's browser holds this and sends it back. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  token!: string | null;

  /** Free-text note from the reviewer (why declined, who approved). */
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
