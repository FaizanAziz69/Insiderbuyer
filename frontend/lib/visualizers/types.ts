/**
 * The suite's shared data model — Developer Brief v2 §3.3 and §7.3.
 *
 * One vocabulary for four products, so a panel written against `Entity` +
 * `InsiderSnapshot` works in Gov Contracts, Goldminer and Biotech without a
 * line of per-vertical plumbing. Adding a fifth vertical means adding one
 * `VerticalDetail` member and one module component — a configuration exercise,
 * which is the architectural promise in §1.
 */

export type Vertical = 'prediction' | 'contracts' | 'mining' | 'biotech';

/** §3.3 Entity. */
export interface SuiteEntity {
  id: string;
  name: string;
  isPublic: boolean;
  ticker: string | null;
  exchange: string | null;
  countryHq?: string | null;
  description?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  /** §8 editorial firewall — paid IR clients carry a disclosure badge. */
  isClient?: boolean;
}

/** §3.3 Fundamentals. */
export interface SuiteFundamentals {
  marketCap: number | null;
  price: number | null;
  sharesOutstanding?: number | null;
  cash?: number | null;
  debt?: number | null;
  enterpriseValue?: number | null;
  wk52Low?: number | null;
  wk52High?: number | null;
  avgVolume?: number | null;
}

/** §3.3 InsiderSnapshot — the moat, present on every listed-company panel. */
export interface SuiteInsiderSnapshot {
  ticker: string;
  insiderOwnershipPct: number | null;
  netBuys90d: number | null;
  netSells90d: number | null;
  iqsScore: number | null;
  notable: {
    who: string;
    role: string | null;
    date: string;
    value: number;
    side: 'buy' | 'sell';
  }[];
}

/** §3.3 Bubble — what the engine actually renders. */
export interface SuiteBubble<T = unknown> {
  id: string;
  vertical: Vertical;
  entityId?: string | null;
  lat?: number | null;
  lng?: number | null;
  sizeMetric: string;
  sizeValue: number;
  label: string;
  sublabel?: string | null;
  colorMetric?: string | null;
  colorValue?: number | null;
  regionTags?: string[];
  data: T;
}

/* ------------------------------------------------- VerticalDetail members */

/** §7.3 MarketContract. */
export interface MarketContract {
  id: string;
  source: string;
  sourceId: string;
  question: string;
  shortLabel: string;
  category: string;
  endDate: string | null;
  status: string;
  yesPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  volumeTotal: number;
  volume24h: number;
  openInterest: number | null;
  oneDayChange: number | null;
  slug: string | null;
  iconUrl: string | null;
  updatedAt: number;
}

export interface PriceTick {
  t: number;
  p: number;
}

export interface MarketTrade {
  side: string;
  sizeUsd: number;
  price: number;
  ts: number;
  outcome: string;
}

/** §6.2 ContractAward. */
export interface ContractAward {
  id: string;
  agency: string | null;
  awardDate: string | null;
  amountUsd: number;
  description: string | null;
  vehicle: string | null;
  popStart: string | null;
  popEnd: string | null;
}

export interface ContractsBubble {
  id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  isPublic: boolean;
  region: string;
  totalUsd: number;
  priorUsd: number;
  trendPct: number | null;
  topAgency: string | null;
  awardCount: number;
  govRevenueSharePct: number | null;
  marketCap: number | null;
  price: number | null;
  iqs: number | null;
  /** §6.2 the shared "insiders buying" toggle's predicate, precomputed. */
  insidersBuying?: boolean;
  /** Reviewed and confirmed unlisted, as opposed to merely unmatched. */
  confirmedPrivate?: boolean;
}

/** §4.3 MiningProject. */
export interface MiningProject {
  id: string;
  name: string;
  company: string;
  ticker: string | null;
  exchange: string | null;
  isPublic: boolean;
  lat: number;
  lng: number;
  country: string;
  region: string | null;
  stage: string;
  ozMeasuredIndicated: number | null;
  ozInferred: number | null;
  gradeGpt: number | null;
  depositType: string | null;
  studyType: string | null;
  npvAfterTaxUsd: number | null;
  npvDiscountRate: number | null;
  goldPriceAssumption: number | null;
  irrPct: number | null;
  capexUsd: number | null;
  aiscPerOz: number | null;
  mineLifeYears: number | null;
  annualProductionOz: number | null;
  ownershipPct: number | null;
  jvPartners: string | null;
  /** §4.2 the sizing hierarchy's answer plus its provenance string. */
  assetValueUsd: number;
  sizedBy: string;
  /** §4.3 fair-value snapshot against the peer-stage median. */
  evPerOz: number | null;
  peerMedianEvPerOz: number | null;
  /** §4.5 the signature "insiders buying" toggle, precomputed server-side. */
  insidersBuying?: boolean;
  sourceName: string;
  sourceUrl: string | null;
  sourceDate: string;
}

/** §5.2 BiotechProfile. */
export interface BiotechCatalyst {
  id: string;
  eventDate: string;
  isEstimate: boolean;
  type: string;
  description: string;
  drug: string | null;
  indication: string | null;
  daysUntil: number;
  sourceName: string;
  sourceUrl: string | null;
  sourceDate: string;
}

export interface BiotechTrial {
  id: string;
  title: string;
  phase: string | null;
  indication: string | null;
  status: string | null;
  completionDate: string | null;
  enrollment: number | null;
}

export interface BiotechProfile {
  ticker: string;
  name: string;
  lat: number | null;
  lng: number | null;
  hqCity: string | null;
  therapeuticArea: string | null;
  leadAsset: string | null;
  mechanism: string | null;
  marketCap: number | null;
  price: number | null;
  cash: number | null;
  quarterlyBurn: number | null;
  runwayQuarters: number | null;
  financialsAsOf: string | null;
  /** The first six only — the detail panel never shows more, and shipping
   *  every trial for every company was 73% of a 345 KB payload. */
  catalysts: BiotechCatalyst[];
  trials: BiotechTrial[];
  /** Totals across ALL of them, so the map can label without the detail. */
  trialCount?: number;
  catalystCount?: number;
  /** Distinct phases across ALL trials — what the phase filter matches on,
   *  since `trials` is truncated. */
  phases?: string[];
  /** Days to the nearest catalyst — drives the §5.3 pulse. */
  nextCatalystDays: number | null;
  iqs: number | null;
  insidersBuying?: boolean;
}
