/**
 * Frontend mirror of backend/src/iqs/sector-groups.ts — George's eleven main
 * sectors (2026-09-01), plus three hidden groups that exist only so their
 * members are not misfiled (a REIT must not be claimed by the Financials
 * 'invest' keyword).
 *
 * Why a mirror: the `?sectorGroup=` API filter classifies server-side, but the
 * DataTable column filter runs entirely in the browser over rows already
 * fetched. Without this, that dropdown fell back to distinct raw values and
 * listed the SEC's own SIC strings — "Bituminous Coal & Lignite Surface
 * Mining", "Jewelry, Silverware & Plated Ware" — which is what George saw.
 *
 * Order IS precedence: the first group whose `rx` matches (and whose `notRx`
 * does not) wins. Keep this file and the backend one in step.
 */
export interface SectorGroup {
  slug: string;
  label: string;
  rx: RegExp;
  notRx?: RegExp;
  hidden?: true;
}

export const SECTOR_GROUPS: SectorGroup[] = [
  {
    slug: "biotech",
    label: "Biotech",
    rx: /biotech|biological product|pharmaceutic|medicinal chemical|botanical|diagnostic substance|in vitro|in vivo|\bdrugs?\b|genom|\btherapeutic|vaccin|life science|bioscience/i,
    notRx: /retail-|wholesale-/i,
  },
  {
    slug: "healthcare",
    label: "Healthcare",
    rx: /health|medical|surgical|hospital|dental|ophthalmic|clinic|physician|electromedical|electrotherapeutic|x-ray apparatus|irradiation|laboratory analytical|nursing|veterinar|diagnostic/i,
  },
  {
    slug: "real-estate",
    label: "Real Estate",
    rx: /real estate|reit/i,
    hidden: true,
  },
  {
    slug: "energy",
    label: "Energy",
    rx: /energy|petroleum|oil & gas|oil and gas|oil royalty|oil ?field|crude|natural gas|gas transmission|pipe ?line|drilling|coal|lignite|solar|renewable|wind power/i,
  },
  {
    slug: "metals-mining",
    label: "Metals and Mining",
    rx: /mining|\bmines?\b|\bores\b|\bgold\b|\bsilver\b|copper|platinum|uranium|lithium|nonferrous|smelting|foundries|\bsteel\b|aluminum|rolling drawing|extruding|metal/i,
  },
  {
    slug: "utilities",
    label: "Utilities",
    rx: /utilit|electric services|water supply|gas distribution|sanitary services|refuse/i,
    hidden: true,
  },
  {
    slug: "technology",
    label: "Technology",
    rx: /technology|software|computer|semiconductor|electronic|internet|information technology|data processing|data preparation|printed circuit|communications equipment|\bit services\b|cyber/i,
    notRx: /retail-|wholesale-/i,
  },
  {
    slug: "communication",
    label: "Communication & Media",
    rx: /communication|media|telecom|broadcast|publish|entertainment|advertising|cable|motion picture/i,
    hidden: true,
  },
  {
    slug: "financials",
    label: "Financials",
    rx: /financial|bank|insurance|finance|invest|savings|securit|asset management|blank check|loan|credit|mortgage|brokers, dealers|commodity brokers/i,
  },
  {
    slug: "materials",
    label: "Materials",
    rx: /basic materials|chemical|cement|plastic|synth resin|rubber|\bpaper\b|lumber|\bglass\b|packaging|container|fertilizer|industrial gas/i,
    notRx: /retail-/i,
  },
  {
    slug: "consumer-staples",
    label: "Consumer Staples",
    rx: /consumer defensive|consumer staple|\bfood|beverage|grocery|supermarket|household product|tobacco|agricultur|dairy|bakery|\bmeat\b|sausage|fats & oils|canned|ice cream|frozen dessert|soap|detergent|drug store/i,
  },
  {
    slug: "consumer-discretionary",
    label: "Consumer Discretionary",
    rx: /consumer cyclical|consumer discretionary|retail|restaurant|\beating\b|apparel|footwear|\bauto\b|hotel|leisure|recreation|amusement|casino|gaming|\bgames\b|toys|furniture|jewelry|watches|clocks|motorcycle|bicycle|audio & video|educational|personal service|operative builders|homebuild/i,
  },
  {
    slug: "manufacturing",
    label: "Manufacturing",
    rx: /industrial|manufactur|machinery|machines|\bequip|instrument|hardware|aerospace|defense|construction|engineering|transport|trucking|\btruck\b|airline|air transportation|railroad|motor vehicle|electrical|electric lighting|\bwaste\b/i,
    notRx: /rental|leasing/i,
  },
];

/** The eleven George actually wants offered, in his order. */
export const VISIBLE_SECTOR_GROUPS = SECTOR_GROUPS.filter((g) => !g.hidden);

/** First group matching the company's sector OR industry string. */
export function sectorGroupFor(
  sector?: string | null,
  industry?: string | null,
): SectorGroup | null {
  const hay = `${sector ?? ""} ${industry ?? ""}`.trim();
  if (!hay) return null;
  return (
    SECTOR_GROUPS.find((g) => g.rx.test(hay) && !(g.notRx && g.notRx.test(hay))) ??
    null
  );
}

/**
 * DataTable `filterPresets` for a sector column: the same eleven options on
 * every table, instead of whichever raw SIC strings happen to be on the page.
 * `pick` tells us where the row keeps its sector/industry text.
 */
export function sectorFilterPresets<T>(
  pick: (row: T) => { sector?: string | null; industry?: string | null },
): { key: string; label: string; test: (row: T) => boolean }[] {
  return VISIBLE_SECTOR_GROUPS.map((g) => ({
    key: g.slug,
    label: g.label,
    test: (row: T) => {
      const { sector, industry } = pick(row);
      return sectorGroupFor(sector, industry)?.slug === g.slug;
    },
  }));
}
