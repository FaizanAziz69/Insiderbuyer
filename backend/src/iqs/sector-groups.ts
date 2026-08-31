/**
 * Canonical sector buckets for score filtering and sector context
 * (George, 2026-09-01: sector filters for the Insider Score, and sector
 * context wherever the score is broken down).
 *
 * `Company.sector` is a mix of GICS names ("Technology", "Healthcare") and
 * raw SEC SIC descriptions ("Pharmaceutical Preparations", "State Commercial
 * Banks"), often one company per label — an exact-match filter would silently
 * drop half the tape. Each group therefore matches by keyword over BOTH the
 * sector and industry strings, the same technique the stock-lists keyword
 * rules use. A company matches the FIRST group whose regex hits, in this
 * order — keep the more specific groups (REITs before Financials would not
 * matter here, but Healthcare before Technology catches "Medical Software"
 * the way a reader expects).
 */
export interface SectorGroup {
  slug: string;
  label: string;
  rx: RegExp;
}

export const SECTOR_GROUPS: SectorGroup[] = [
  {
    slug: 'healthcare',
    label: 'Healthcare',
    rx: /health|pharmaceutical|biological|medical|surgical|biotech|drug|diagnostic|hospital|dental|ophthalmic/i,
  },
  {
    slug: 'financials',
    label: 'Financials',
    rx: /financial|bank|insurance|finance|invest|savings|securit|asset management|blank check|loan|credit/i,
  },
  {
    slug: 'technology',
    label: 'Technology',
    rx: /technology|software|computer|semiconductor|electronic|internet|information|data processing/i,
  },
  {
    slug: 'energy',
    label: 'Energy',
    rx: /energy|petroleum|oil|natural gas|coal|drilling|pipeline|solar|renewable/i,
  },
  {
    slug: 'materials',
    label: 'Basic Materials',
    rx: /basic materials|mining|gold|silver|metal|chemical|steel|paper|lumber|cement|glass/i,
  },
  {
    slug: 'industrials',
    label: 'Industrials',
    rx: /industrial|machinery|aerospace|defense|construction|engineering|transport|trucking|airline|railroad|electrical equipment|waste/i,
  },
  {
    slug: 'consumer-cyclical',
    label: 'Consumer Cyclical',
    rx: /consumer cyclical|retail|restaurant|apparel|auto|hotel|leisure|recreation|casino|gaming|furniture|footwear/i,
  },
  {
    slug: 'consumer-defensive',
    label: 'Consumer Defensive',
    rx: /consumer defensive|food|beverage|grocery|household|tobacco|agricultur|dairy|bakery/i,
  },
  {
    slug: 'real-estate',
    label: 'Real Estate',
    rx: /real estate|reit/i,
  },
  {
    slug: 'utilities',
    label: 'Utilities',
    rx: /utilit|electric services|water supply|gas distribution|sanitary services/i,
  },
  {
    slug: 'communication',
    label: 'Communication & Media',
    rx: /communication|media|telecom|broadcast|publish|entertainment|advertising|cable/i,
  },
];

export function sectorGroupBySlug(slug?: string | null): SectorGroup | null {
  if (!slug) return null;
  return SECTOR_GROUPS.find((g) => g.slug === slug.toLowerCase()) ?? null;
}

/** First group matching the company's sector OR industry string. */
export function sectorGroupFor(
  sector?: string | null,
  industry?: string | null,
): SectorGroup | null {
  const hay = `${sector ?? ''} ${industry ?? ''}`.trim();
  if (!hay) return null;
  return SECTOR_GROUPS.find((g) => g.rx.test(hay)) ?? null;
}
