/**
 * House style enforced on every piece of model-written prose the site
 * serves (chat replies, insider and member bios, movement explainers, bull/
 * bear cases, generated articles, story pitches).
 *
 * Client instruction (2026-09-18): no em dashes or en dashes anywhere, so the
 * copy reads less like machine output. Two layers, because a prompt rule
 * alone is not enforcement: the rule below is appended to every system
 * prompt, and stripDashes() rewrites whatever still slips through before it
 * is cached or served.
 */
export const NO_DASH_RULE =
  'HOUSE STYLE (mandatory): never use an em dash or an en dash anywhere in your output, not even in ranges or asides. ' +
  'Use a comma, a colon, a period, or parentheses instead, and write ranges with "to" (for example "15 to 21 analysts"). ' +
  'Prefer plain, direct sentences over dash-joined clauses.';

const ENTITY_DASH = /&(?:mdash|ndash|#8211|#8212|#x2013|#x2014);/gi;

/** Rewrite em/en dashes (and their HTML entities) into house-style punctuation. */
export function stripDashes(text: string): string {
  if (!text || !/[\u2013\u2014]|&(?:mdash|ndash|#821[12]|#x201[34]);/i.test(text)) return text;
  return (
    text
      .replace(ENTITY_DASH, '\u2014')
      // numeric ranges: "15–21", "$3.52–$3.73", "2–4" -> "15 to 21"
      .replace(/(\d)\s*[\u2013\u2014]\s*(\$?\d)/g, '$1 to $2')
      // a dash that opens a line ("— The Editorial Team") is dropped
      .replace(/^([ \t]*)[\u2013\u2014]+\s*/gm, '$1')
      // a dash that closes a sentence or line becomes a period
      .replace(/\s*[\u2013\u2014]+\s*(?=$|\n|<\/)/gm, '.')
      // everything else is an aside or a joined clause: a comma
      .replace(/\s*[\u2013\u2014]+\s*/g, ', ')
      // tidy the punctuation the rewrite can leave behind
      .replace(/,\s*([,.;:!?])/g, '$1')
      .replace(/([.;:!?])\s*,\s*/g, '$1 ')
      .replace(/\(\s*,\s*/g, '(')
      .replace(/\s*,\s*\)/g, ')')
      .replace(/\.\.(?!\.)/g, '.')
  );
}

/** stripDashes over every string in a plain object or array (tool_use inputs). */
export function stripDashesDeep<T>(value: T): T {
  if (typeof value === 'string') return stripDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => stripDashesDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripDashesDeep(v);
    return out as T;
  }
  return value;
}
