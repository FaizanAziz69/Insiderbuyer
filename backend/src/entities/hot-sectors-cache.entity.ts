import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Last GOOD Hot Sectors snapshot.
 *
 * Why a table: the page's heat score is 40% breadth — "how many of this
 * basket's names are up 10%+ this month" — and the month-to-date baselines
 * behind it are fetched per symbol under a 2.5s budget and cached IN PROCESS.
 * So a freshly restarted backend resolves only a prefix of the ~400 members and
 * every basket's breadth is computed over whatever arrived: after each deploy
 * the ranking was briefly wrong (2026-08-25 — the client caught Gold, the
 * hottest basket on the day, reading as weak).
 *
 * A snapshot is written only when coverage is high, and a low-coverage
 * computation serves the stored one instead of publishing itself.
 */
@Entity('hot_sectors_cache')
export class HotSectorsCache {
  /** Single row. */
  @PrimaryColumn({ type: 'varchar', length: 16 })
  key!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  /** Share of basket members whose month-to-date return resolved, 0–1. */
  @Column({ type: 'numeric', precision: 5, scale: 4 })
  coverage!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
