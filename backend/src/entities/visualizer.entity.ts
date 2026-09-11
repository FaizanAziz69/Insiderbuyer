import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tables behind the Bubble Visualizer Suite (Developer Brief v2 §3.3, §7.3).
 *
 * One schema family for four products. `viz_entity` is the shared company
 * record every vertical points at (§3.3 Entity) so a ticker resolved once for
 * Gov Contracts is the same row Goldminer and Biotech read; each vertical then
 * owns its own detail table (MiningProject | BiotechProfile | ContractAward |
 * MarketContract).
 *
 * Two deliberate substitutions from the brief's stack, both because this app
 * runs as ONE always-on pm2 process against Postgres with no Redis:
 *   - the per-market price/trade ring buffers (§7.3 PriceTick/MarketTrade) live
 *     in memory and are flushed into the `history` / `trades` jsonb columns
 *     here, which is what a Redis ring buffer would have held; and
 *   - the pub/sub fan-out is an in-process EventEmitter feeding SSE, not Redis
 *     channels. Both become drop-in if a second worker host ever appears.
 */

/** §3.3 Entity — the shared company record across all four verticals. */
@Entity('viz_entity')
export class VizEntity {
  /** Stable slug: ticker when listed, else a kebab of the legal name. */
  @PrimaryColumn({ type: 'varchar', length: 96 })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'boolean', default: true })
  isPublic!: boolean;

  @Index()
  @Column({ type: 'varchar', length: 24, nullable: true })
  ticker!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  exchange!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  countryHq!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  website!: string | null;

  @Column({ type: 'text', nullable: true })
  logoUrl!: string | null;

  /** §8 editorial firewall — a paid IR client carries a disclosure badge. */
  @Column({ type: 'boolean', default: false })
  isClient!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * §7.2 curation layer — the admin allowlist. We do NOT display every market;
 * a row here is an explicit editorial decision to show one, with our own short
 * label and category mapping.
 */
@Entity('viz_curated_market')
export class VizCuratedMarket {
  /** `${source}:${sourceId}` — same key the client sees as MarketContract.id. */
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ type: 'varchar', length: 24 })
  source!: string;

  @Column({ type: 'varchar', length: 96 })
  sourceId!: string;

  /** Our display label ("BTC > $150K"), not the venue's long question. */
  @Column({ type: 'varchar', length: 64 })
  shortLabel!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /** Below this 24h dollar volume the market is hidden as too thin. */
  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  minVolume!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  /** 'auto' when the volume ranker added it, 'editor' when a human did. */
  @Column({ type: 'varchar', length: 16, default: 'auto' })
  curatedBy!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** §7.3 MarketContract, plus the two ring buffers as jsonb. */
@Entity('viz_market_contract')
export class VizMarketContract {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ type: 'varchar', length: 24 })
  source!: string;

  @Column({ type: 'varchar', length: 96 })
  sourceId!: string;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'varchar', length: 64 })
  shortLabel!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  category!: string;

  @Column({ type: 'timestamptz', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  yesPrice!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  bestBid!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  bestAsk!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  volumeTotal!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  volume24h!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  openInterest!: string | null;

  /** Venue price change over the trailing day — drives "biggest movers". */
  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  oneDayChange!: string | null;

  /** Venue identifiers needed to fetch history and trades. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  conditionId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  yesTokenId!: string | null;

  @Column({ type: 'text', nullable: true })
  slug!: string | null;

  @Column({ type: 'text', nullable: true })
  iconUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** PriceTick ring buffer, newest last, capped at 500. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  history!: { t: number; p: number }[];

  /** MarketTrade ring buffer, newest first, capped at 50. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  trades!: { side: string; sizeUsd: number; price: number; ts: number; outcome: string }[];

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * §6.3 the hard problem: awardee legal entity → ticker. This mapping IS the
 * product, so it is a first-class table with manual overrides, not a heuristic
 * applied at read time.
 */
@Entity('viz_gov_recipient')
export class VizGovRecipient {
  /** Normalised recipient name (upper, punctuation stripped). */
  @PrimaryColumn({ type: 'varchar', length: 256 })
  id!: string;

  @Column({ type: 'text' })
  displayName!: string;

  @Column({ type: 'varchar', length: 8 })
  region!: string;

  @Index()
  @Column({ type: 'varchar', length: 24, nullable: true })
  ticker!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  exchange!: string | null;

  /** UEI (US) or Procurement Business Number (Canada) when disclosed. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  uei!: string | null;

  /** false = confirmed private/state-owned; renders as a dashed bubble. */
  @Column({ type: 'boolean', default: true })
  isPublic!: boolean;

  /** 'manual' beats every automated match and is never overwritten. */
  @Column({ type: 'varchar', length: 16, default: 'auto' })
  resolvedBy!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3, default: 0 })
  confidence!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** §6.2 one award row, kept so the panel can list agency/date/value/description. */
@Entity('viz_contract_award')
export class VizContractAward {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 256 })
  recipientId!: string;

  @Column({ type: 'varchar', length: 8 })
  region!: string;

  @Column({ type: 'text', nullable: true })
  agency!: string | null;

  @Column({ type: 'date', nullable: true })
  awardDate!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  amountUsd!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  vehicle!: string | null;

  @Column({ type: 'date', nullable: true })
  popStart!: string | null;

  @Column({ type: 'date', nullable: true })
  popEnd!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * §4 Goldminer — one physical gold project. Every economic figure carries the
 * study it came from and an as-of date (§8: no invented numbers).
 */
@Entity('viz_mining_project')
export class VizMiningProject {
  @PrimaryColumn({ type: 'varchar', length: 96 })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  company!: string;

  @Index()
  @Column({ type: 'varchar', length: 24, nullable: true })
  ticker!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  exchange!: string | null;

  @Column({ type: 'boolean', default: true })
  isPublic!: boolean;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 64 })
  country!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  region!: string | null;

  /** Exploration | Resource | PEA | PFS | FS | Construction | Production */
  @Column({ type: 'varchar', length: 24 })
  stage!: string;

  @Column({ type: 'double precision', nullable: true })
  ozMeasuredIndicated!: number | null;

  @Column({ type: 'double precision', nullable: true })
  ozInferred!: number | null;

  @Column({ type: 'double precision', nullable: true })
  gradeGpt!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  depositType!: string | null;

  /** PEA | PFS | FS — which study the economics below come from. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  studyType!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  npvAfterTaxUsd!: string | null;

  @Column({ type: 'double precision', nullable: true })
  npvDiscountRate!: number | null;

  @Column({ type: 'double precision', nullable: true })
  goldPriceAssumption!: number | null;

  @Column({ type: 'double precision', nullable: true })
  irrPct!: number | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  capexUsd!: string | null;

  @Column({ type: 'double precision', nullable: true })
  aiscPerOz!: number | null;

  @Column({ type: 'double precision', nullable: true })
  mineLifeYears!: number | null;

  @Column({ type: 'double precision', nullable: true })
  annualProductionOz!: number | null;

  @Column({ type: 'double precision', nullable: true })
  ownershipPct!: number | null;

  @Column({ type: 'text', nullable: true })
  jvPartners!: string | null;

  /** §8 provenance, mandatory on every row. */
  @Column({ type: 'text' })
  sourceName!: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'date' })
  sourceDate!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** §5.2 one upcoming biotech catalyst (PDUFA | AdCom | Readout). */
@Entity('viz_biotech_catalyst')
export class VizBiotechCatalyst {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 24 })
  ticker!: string;

  @Column({ type: 'date' })
  eventDate!: string;

  /** true when the date is a quarter/half guide rather than a fixed day. */
  @Column({ type: 'boolean', default: false })
  isEstimate!: boolean;

  @Column({ type: 'varchar', length: 24 })
  type!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  drug!: string | null;

  @Column({ type: 'text', nullable: true })
  indication!: string | null;

  @Column({ type: 'text' })
  sourceName!: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'date' })
  sourceDate!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** §5.2 active trials pulled from ClinicalTrials.gov for curated tickers. */
@Entity('viz_biotech_trial')
export class VizBiotechTrial {
  /** NCT id. */
  @PrimaryColumn({ type: 'varchar', length: 24 })
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 24 })
  ticker!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phase!: string | null;

  @Column({ type: 'text', nullable: true })
  indication!: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  status!: string | null;

  @Column({ type: 'date', nullable: true })
  completionDate!: string | null;

  @Column({ type: 'int', nullable: true })
  enrollment!: number | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * §5 the biotech company row: HQ coordinates for the map, pipeline summary and
 * the cash/burn pair the runway calculation divides.
 */
@Entity('viz_biotech_profile')
export class VizBiotechProfile {
  @PrimaryColumn({ type: 'varchar', length: 24 })
  ticker!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'double precision', nullable: true })
  lat!: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng!: number | null;

  @Column({ type: 'text', nullable: true })
  hqCity!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  therapeuticArea!: string | null;

  @Column({ type: 'text', nullable: true })
  leadAsset!: string | null;

  @Column({ type: 'text', nullable: true })
  mechanism!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  marketCap!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  cash!: string | null;

  /** Trailing-quarter operating cash burn (positive number = cash out). */
  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  quarterlyBurn!: string | null;

  @Column({ type: 'date', nullable: true })
  financialsAsOf!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * Pre-composed payloads for the map/field reads (same pattern as
 * `bubbles_cache`): the cron pays the fan-out cost, the endpoint is a single
 * primary-key read. Keyed `<vertical>:<params>`, e.g. `contracts:us:1y`.
 */
@Entity('viz_payload_cache')
export class VizPayloadCache {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;
}
