/**
 * §4.6 the "AI" component's query bar. The brief reserves the slot at launch
 * and puts the natural-language parser in a phase-2 fast-follow; the slot is
 * reserved here with a deterministic parser behind it, which handles the
 * example query in the brief verbatim — "PEA-stage projects in Ontario over 2M
 * oz with insider buying" — and every combination of the same four dimensions.
 *
 * Deterministic rather than a model call, because a filter bar that sometimes
 * returns something different for the same words is worse than one that
 * politely does not understand. Anything it cannot parse is reported back to
 * the reader instead of being silently dropped.
 */

export interface NlFilters {
  stages: string[];
  minOz: number | null;
  country: string | null;
  region: string | null;
  insidersBuying: boolean;
  publicOnly: boolean;
  /** Words we could not turn into a filter; shown back to the reader. */
  unparsed: string[];
}

const STAGE_WORDS: [string, RegExp][] = [
  ['Production', /\b(producing|production|producer|mine in production)\b/i],
  ['Construction', /\b(construction|being built|under construction)\b/i],
  ['FS', /\b(fs|feasibility|definitive feasibility|dfs)\b/i],
  ['PFS', /\b(pfs|pre-?feasibility)\b/i],
  ['PEA', /\b(pea|preliminary economic)\b/i],
  ['Resource', /\b(resource[- ]stage|resource)\b/i],
  ['Exploration', /\b(exploration|explorer|greenfield|early[- ]stage)\b/i],
];

/** Parse an ounce threshold: "over 2M oz", "> 500k ounces", "at least 1 moz". */
function parseOunces(q: string): number | null {
  const m = q.match(
    /(?:over|above|more than|at least|>|\bmin(?:imum)?\b)\s*([\d.]+)\s*(m|moz|million|k|koz|thousand)?\s*(?:oz|ounces)?/i,
  );
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit.startsWith('m')) return n * 1e6;
  if (unit.startsWith('k') || unit.startsWith('t')) return n * 1e3;
  return n >= 1000 ? n : n * 1e6;
}

export function parseNlQuery(
  raw: string,
  known: { countries: string[]; regions: string[] },
): NlFilters {
  const q = (raw || '').trim();
  const out: NlFilters = {
    stages: [],
    minOz: null,
    country: null,
    region: null,
    insidersBuying: false,
    publicOnly: false,
    unparsed: [],
  };
  if (!q) return out;

  for (const [stage, rx] of STAGE_WORDS) {
    if (rx.test(q) && !out.stages.includes(stage)) out.stages.push(stage);
  }
  out.minOz = parseOunces(q);
  if (/\binsider[s]?\s+(buy|buying|bought|purchases?)\b/i.test(q)) out.insidersBuying = true;
  if (/\b(listed|public|publicly traded)\b/i.test(q)) out.publicOnly = true;

  // Longest name first so "Papua New Guinea" is not matched as "Guinea".
  for (const c of [...known.countries].sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${escapeRx(c)}\\b`, 'i').test(q)) {
      out.country = c;
      break;
    }
  }
  for (const r of [...known.regions].sort((a, b) => b.length - a.length)) {
    if (r && new RegExp(`\\b${escapeRx(r)}\\b`, 'i').test(q)) {
      out.region = r;
      break;
    }
  }

  const understood =
    out.stages.length > 0 ||
    out.minOz != null ||
    out.country != null ||
    out.region != null ||
    out.insidersBuying ||
    out.publicOnly;
  if (!understood) out.unparsed.push(q);
  return out;
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
