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

  /**
   * The PTR document this row came from — Brief v9 §6 lists filing links in the
   * Evidence group and marks them FREE, which is the whole claim the index
   * makes: every figure traces to a filing anyone can open.
   *
   * FMP has been sending it as `link` on every row (efdsearch.senate.gov and
   * disclosures-clerk.house.gov URLs); `mapCongress` has been reading it into
   * `sourceUrl` all along and the save then dropped it for want of a column.
   */
  @Column({ type: 'text', nullable: true })
  sourceUrl!: string | null;

  /**
   * Who held the position — Self / Spouse / Joint, as the filing states.
   *
   * §1 wants third-party-managed and blind/qualified-trust purchases scored at
   * 0.25x. This column is where that marker would live, and the feed does not
   * carry one: across both chambers' latest pages `owner` is only ever Self,
   * Spouse, Joint or empty, and `comment` — the field that would hold a trust
   * note — is empty on every row. The discount is therefore NOT implemented,
   * because inventing it from `owner` would discount every spouse's trade as
   * though it were a blind trust, which is a different claim entirely.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  owner!: string | null;

  /**
   * The filing's own security classification — Stock, ETF, Mutual Fund,
   * Corporate Bond, REIT, Stock Option.
   *
   * §1 excludes funds and bonds from the universe. That test has been running
   * on the asset's NAME, which is guesswork dressed as a rule; this is the
   * issuer's own answer. Kept alongside the name test rather than replacing it
   * — history has no assetType until a row is re-ingested.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  assetType!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
