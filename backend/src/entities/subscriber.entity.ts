import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('subscribers')
@Index(['email'], { unique: true })
export class Subscriber {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  /** Comma-separated capture tags — a subscriber can arrive through the exit
   *  popup and later ask for alerts, and both need to survive. 80 chars was
   *  enough for one tag and would truncate the second mid-word, which would
   *  quietly break the recipient match. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  source!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
