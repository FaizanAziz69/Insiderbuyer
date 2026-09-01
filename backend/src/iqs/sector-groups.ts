/**
 * Canonical sector buckets for score filtering and sector context
 * (George, 2026-09-01: sector filters for the Insider Score, and sector
 * context wherever the score is broken down; revised same day to the eleven
 * "main sectors" he named — the previous GICS-shaped list read as random).
 *
 * `Company.sector` is a mix of GICS names ("Technology", "Healthcare") and
 * raw SEC SIC descriptions ("Pharmaceutical Preparations", "State Commercial
 * Banks"), often one company per label — an exact-match filter would silently
 * drop half the tape. Each group therefore matches by keyword over BOTH the
 * sector and industry strings, the same technique the stock-lists keyword
 * rules use.
 *
 * A company matches the FIRST group whose `rx` hits (and whose `notRx` does
 * not), so ARRAY ORDER IS PRECEDENCE, most specific first: Biotech before
 * Healthcare ("Pharmaceutical Preparations" is a drug developer, not a
 * provider), Energy before Metals & Mining ("Bituminous Coal & Lignite
 * Surface Mining" is fuel), Materials before Manufacturing ("Industrial
 * Organic Chemicals" is not a machine shop).
 *
 * `hidden: true` groups are NOT offered in the filter — George's list has no
 * Real Estate / Utilities / Communication bucket. They stay in the table for
 * two reasons: they keep those companies OUT of neighbouring buckets (without
 * the Real Estate rule the Financials 'invest' keyword claims every "Real
 * Estate Investment Trust"), and company pages still get honest sector
 * context. The visible list lives in frontend/components/SectorFilter.tsx and
 * is ordered the way George wrote it, not by precedence.
 */
export interface SectorGroup {
  slug: string;
  label: string;
  rx: RegExp;
  /** Vetoes an `rx` hit — e.g. "Retail-Computer & Computer Software Stores"
   *  is a shop, not a tech company. */
  notRx?: RegExp;
  /** Classify-only: never shown as a filter option. */
  hidden?: true;
}

export const SECTOR_GROUPS: SectorGroup[] = [
  {
    // Before Healthcare: drug developers, not care delivery. Excludes
    // retail/wholesale so a drug store isn't filed as a biotech.
    slug: 'biotech',
    label: 'Biotech',
    rx: /biotech|biological product|pharmaceutic|medicinal chemical|botanical|diagnostic substance|in vitro|in vivo|\bdrugs?\b|genom|\btherapeutic|vaccin|life science|bioscience/i,
    notRx: /retail-|wholesale-/i,
  },
  {
    slug: 'healthcare',
    label: 'Healthcare',
    rx: /health|medical|surgical|hospital|dental|ophthalmic|clinic|physician|electromedical|electrotherapeutic|x-ray apparatus|irradiation|laboratory analytical|nursing|veterinar|diagnostic/i,
  },
  {
    // Hidden, and before Financials: "Real Estate Investment Trusts" must not
    // be claimed by the financials 'invest' keyword.
    slug: 'real-estate',
    label: 'Real Estate',
    rx: /real estate|reit/i,
    hidden: true,
  },
  {
    // Before Metals & Mining: coal is fuel. Deliberately no bare 'oil' — that
    // matched "Fats & Oils" (a food company) — and no bare 'refining', which
    // matched "Primary Smelting & Refining of Nonferrous Metals".
    slug: 'energy',
    label: 'Energy',
    rx: /energy|petroleum|oil & gas|oil and gas|oil royalty|oil ?field|crude|natural gas|gas transmission|pipe ?line|drilling|coal|lignite|solar|renewable|wind power/i,
  },
  {
    // \bsilver\b, not 'silver': "Jewelry, Silverware & Plated Ware" is a
    // consumer name.
    slug: 'metals-mining',
    label: 'Metals and Mining',
    rx: /mining|\bmines?\b|\bores\b|\bgold\b|\bsilver\b|copper|platinum|uranium|lithium|nonferrous|smelting|foundries|\bsteel\b|aluminum|rolling drawing|extruding|metal/i,
  },
  {
    slug: 'utilities',
    label: 'Utilities',
    rx: /utilit|electric services|water supply|gas distribution|sanitary services|refuse/i,
    hidden: true,
  },
  {
    slug: 'technology',
    label: 'Technology',
    rx: /technology|software|computer|semiconductor|electronic|internet|information technology|data processing|data preparation|printed circuit|communications equipment|\bit services\b|cyber/i,
    notRx: /retail-|wholesale-/i,
  },
  {
    slug: 'communication',
    label: 'Communication & Media',
    rx: /communication|media|telecom|broadcast|publish|entertainment|advertising|cable|motion picture/i,
    hidden: true,
  },
  {
    slug: 'financials',
    label: 'Financials',
    rx: /financial|bank|insurance|finance|invest|savings|securit|asset management|blank check|loan|credit|mortgage|brokers, dealers|commodity brokers/i,
  },
  {
    // Before Consumer Staples: "Agricultural Chemicals" is fertiliser, not
    // farming. Note there is no bare 'materials' keyword — that would claim
    // "Retail-Building Materials, Hardware, Garden Supply".
    slug: 'materials',
    label: 'Materials',
    rx: /basic materials|chemical|cement|plastic|synth resin|rubber|\bpaper\b|lumber|\bglass\b|packaging|container|fertilizer|industrial gas/i,
    // A lumber YARD is a shop: "Retail-Lumber & Other Building Materials
    // Dealers" belongs to Consumer Discretionary.
    notRx: /retail-/i,
  },
  {
    slug: 'consumer-staples',
    label: 'Consumer Staples',
    rx: /consumer defensive|consumer staple|\bfood|beverage|grocery|supermarket|household product|tobacco|agricultur|dairy|bakery|\bmeat\b|sausage|fats & oils|canned|ice cream|frozen dessert|soap|detergent|drug store/i,
  },
  {
    slug: 'consumer-discretionary',
    label: 'Consumer Discretionary',
    rx: /consumer cyclical|consumer discretionary|retail|restaurant|\beating\b|apparel|footwear|\bauto\b|hotel|leisure|recreation|amusement|casino|gaming|\bgames\b|toys|furniture|jewelry|watches|clocks|motorcycle|bicycle|audio & video|educational|personal service|operative builders|homebuild/i,
  },
  {
    // The catch-all industrial bucket (George replaced "Industrials" with
    // "Manufacturing"), so it also carries transport, construction, aerospace
    // and defence. `notRx` keeps equipment RENTAL houses out of it.
    slug: 'manufacturing',
    label: 'Manufacturing',
    rx: /industrial|manufactur|machinery|machines|\bequip|instrument|hardware|aerospace|defense|construction|engineering|transport|trucking|\btruck\b|airline|air transportation|railroad|motor vehicle|electrical|electric lighting|\bwaste\b/i,
    notRx: /rental|leasing/i,
  },
];

/** Options offered in the UI, in George's order — see SectorFilter.tsx. */
export const VISIBLE_SECTOR_GROUPS = SECTOR_GROUPS.filter((g) => !g.hidden);

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
  return (
    SECTOR_GROUPS.find((g) => g.rx.test(hay) && !g.notRx?.test(hay)) ?? null
  );
}
