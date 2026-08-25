import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A ticker a signed-in user is watching.
 *
 * The watchlist page has always kept its list in localStorage, which is fine
 * for a browser but means the server has no idea who is watching what — and
 * "we send you an alert when an insider files a Form 4 on a stock you're
 * watching" cannot be true of a list only the browser can see. Signed-in users
 * mirror their list here; signed-out visitors keep the local one.
 */
@Entity('watchlist_items')
@Index(['userId', 'ticker'], { unique: true })
export class WatchlistItem {
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
