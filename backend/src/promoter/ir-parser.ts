/**
 * Workstream F — IR Budget / Promoter Score. The parser.
 *
 * Developer Project Brief v2 (Sept 1 2026) §2.3: "Scraper/parser for
 * IR-agreement disclosures … TSXV Policy 3.4 announcements follow a
 * recognizable pattern: firm name, monthly fee, term, options granted" and
 * "Expect messy inputs: fees stated monthly vs. total, mixed CAD/USD,
 * amendments and terminations. Store the raw disclosure text alongside parsed
 * fields, flag low-confidence parses for manual review."
 *
 * Everything here is PURE — text in, fields + a confidence out, no I/O. That
 * is what lets the harvested corpus be replayed offline (`ir-parser.spec.ts`)
 * and the parse rate measured before any of it reaches the database.
 *
 * Why a regex parser at all when a model could read these: the numbers in this
 * dataset are the product, IR firms will dispute them (§2.5), and a
 * deterministic parse is reproducible and auditable in a way a model call is
 * not. The model is the FALLBACK for what the patterns miss
 * (promoter.service.ts), never the first reader.
 *
 * ── What the corpus taught, and what the shape of this file owes to it ──
 *
 * ONE RELEASE CAN DISCLOSE SEVERAL AGREEMENTS. AXCAP Ventures (CSE: AXCP,
 * May 5 2025) announced three providers in one release, each with its own
 * term and monthly fee, under its own heading; Kalo Gold (TSXV: KALO, April 7
 * 2026) did the same with Fairfax Partners, GOLDINVEST Consulting and NAI
 * Interactive. §2.4 counts "active contract count" and sums spend per issuer,
 * so collapsing those into one row would undercount both. The parser
 * therefore returns a DISCLOSURE (issuer-level) containing AGREEMENTS
 * (provider-level), and each provider gets its own slice of the text.
 *
 * THE PROVIDER IS USUALLY INTRODUCED WITH ITS SHORT FORM. "Adelaide Capital
 * Markets Inc. ("Adelaide")", "JBouma Consulting Ltd. ("JBouma")", "Senergy
 * Communications Capital Inc. (" Senergy ")". That pattern — a proper-noun
 * entity followed by a quoted short form — is both the most reliable way to
 * find providers and the way to find ALL of them. The issuer introduces
 * itself the same way but with a TICKER in the bracket, which is exactly how
 * we tell them apart.
 *
 * THE IR WORDS COME AFTER THE AGREEMENT AS OFTEN AS BEFORE. Grey Wolf:
 * "entered into a consulting agreement with JBouma Consulting Ltd. … to
 * provide investor relations services". A pattern that demands "investor
 * relations agreement" as a phrase misses half the corpus.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type AgreementKind = 'new' | 'amendment' | 'extension' | 'termination';
export type Currency = 'CAD' | 'USD' | 'EUR' | 'GBP' | 'AUD';

/** One issuer↔provider contract. Several of these can come from one release. */
export interface ParsedAgreement {
  providerName: string | null;
  /** What the release calls the provider afterwards — "Adelaide". */
  providerShort: string | null;
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null;
  termMonths: number | null;
  monthlyFee: number | null;
  totalValue: number | null;
  currency: Currency | null;
  /** Options granted TO THIS PROVIDER — never the company-wide grant that so
   *  many of these releases bundle into the same announcement. */
  optionsGranted: number | null;
  optionStrike: number | null;
  sharesGranted: number | null;
  /** The release states in terms that no securities form part of the fee. */
  noSecurityCompensation: boolean;
  armsLength: boolean | null;
  confidence: number;
  /** field → how it was found: "regex:total-of", "derived:monthly*term",
   *  "llm", "manual". Carried into the DB so the B2B feed and the dispute
   *  trail can tell a disclosed number from an arithmetic one. */
  provenance: Record<string, string>;
  notes: string[];
}

export interface ParsedDisclosure {
  ticker: string | null;
  exchange: 'TSXV' | 'CSE' | 'TSX' | 'NEO' | null;
  issuerName: string | null;
  kind: AgreementKind;
  agreements: ParsedAgreement[];
  /** Lowest agreement confidence, docked for issuer-level gaps. */
  confidence: number;
  notes: string[];
}

/** §2.3 "flag low-confidence parses for manual review in the admin". */
export const REVIEW_THRESHOLD = 0.62;

// ── Relevance gate ───────────────────────────────────────────────────────

const ACTIVITY =
  /(investor relations|investor awareness|shareholder communications?|market[- ]making|promotional services|capital markets advisory|investor marketing|digital marketing|investor outreach)/i;
const AGREEMENT =
  /(agreement|engage[ds]?|engagement|retain(?:ed|s)?|contract(?:ed)?|appoint(?:ed|s|ment)?|entered into|consulting|mandate|renew(?:ed|al)?|extension|terminat)/i;

/**
 * Policy 3.4 lives on the Canadian exchanges, and §2.2 is explicit: "Do not
 * attempt US coverage in v1." A Nasdaq issuer hiring an IR firm is out of
 * scope, so a Canadian listing is part of RELEVANCE, not just a field.
 *
 * Shapes seen in the corpus, all of which must match:
 *   (TSXV: DNO)   (TSXV:GWM)   ( TSXV:KALO )   (TSXV: WOLF )
 *   (CSE:AXCP)    ( CSE: RMES,OTC:RMESF )      (TSX-V: ABC)
 * The trailing `[,)]` is what handles the comma-packed multi-listing bracket.
 */
const CA_TICKER =
  /\(\s*(TSX[ -]?V|TSXV|TSX VENTURE|CSE|CNSX|CANADIAN SECURITIES EXCHANGE|NEO|TSX)\s*:\s*([A-Z0-9]{1,6}(?:\.[A-Z]{1,2})?)\s*[,)]/i;

export function isIrDisclosure(title: string, body: string): boolean {
  const text = narrow(body);
  const lead = `${title}\n${text.slice(0, 2200)}`;
  if (!ACTIVITY.test(lead)) return false;
  if (!AGREEMENT.test(`${title}\n${text.slice(0, 4000)}`)) return false;
  // v1 is Canada only. No Canadian listing anywhere in the release ⇒ not our
  // universe; this is what keeps US IR-hire announcements (Delek, Harmonix,
  // Siguler Guff — all in the discovery feed) out of the dataset.
  return CA_TICKER.test(text);
}

// ── Small helpers ────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18,
  'twenty-four': 24, 'twenty four': 24, 'thirty-six': 36, 'thirty six': 36,
};

function toIso(month: string, day: string, year: string): string | null {
  const m = MONTHS[month.toLowerCase()];
  if (!m) return null;
  const d = Number(day), y = Number(year);
  if (!d || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const DATE_RE = /([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/;

function findDate(text: string, ...leads: RegExp[]): string | null {
  for (const lead of leads) {
    const m = lead.exec(text);
    if (!m) continue;
    const d = DATE_RE.exec(m[0]);
    if (d) {
      const iso = toIso(d[1], d[2], d[3]);
      if (iso) return iso;
    }
  }
  return null;
}

interface Money {
  amount: number;
  currency: Currency | null;
}

/**
 * "$6,800.00", "CAD$7,500", "US$10,000 per month", "C$1.2 million".
 *
 * The currency mark matters more than it looks: a TSXV issuer paying "US$" is
 * common, §2.4 sums spend in CAD, and a row that silently treats USD as CAD
 * overstates that issuer's spend by a third.
 */
function parseMoney(raw: string): Money | null {
  const m =
    /(?:(CAD|CDN|C|US|USD|U\.S\.|EUR|GBP|AUD|A)\s*\$|\$\s*(CAD|USD|US)?|\b(CAD|USD|EUR|GBP)\b\s*)\s*([\d][\d,]*(?:\.\d{1,2})?)\s*(million|billion|m\b|k\b|thousand)?/i.exec(
      raw,
    );
  if (!m) return null;
  const mark = (m[1] || m[2] || m[3] || '').toUpperCase();
  let amount = Number(m[4].replace(/,/g, ''));
  if (!isFinite(amount) || amount <= 0) return null;
  const scale = (m[5] || '').toLowerCase();
  if (scale.startsWith('m')) amount *= 1_000_000;
  else if (scale.startsWith('b')) amount *= 1_000_000_000;
  else if (scale === 'k' || scale === 'thousand') amount *= 1_000;
  let currency: Currency | null = null;
  if (/^(CAD|CDN|C)$/.test(mark)) currency = 'CAD';
  else if (/^(US|USD|U\.S\.)$/.test(mark)) currency = 'USD';
  else if (mark === 'EUR') currency = 'EUR';
  else if (mark === 'GBP') currency = 'GBP';
  else if (mark === 'A' || mark === 'AUD') currency = 'AUD';
  return { amount, currency };
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z("'\d])/)
    .filter((s) => s.length > 12);
}

// ── Issuer ───────────────────────────────────────────────────────────────

function findIssuer(text: string): {
  name: string | null;
  ticker: string | null;
  exchange: ParsedDisclosure['exchange'];
} {
  const m = CA_TICKER.exec(text);
  if (!m) return { name: null, ticker: null, exchange: null };
  const ticker = m[2].toUpperCase();
  const ex = m[1].toUpperCase();
  const exchange: ParsedDisclosure['exchange'] = /CSE|CNSX|CANADIAN SECURITIES/.test(ex)
    ? 'CSE'
    : /NEO/.test(ex)
      ? 'NEO'
      : /TSX[ -]?V|TSXV|TSX VENTURE/.test(ex)
        ? 'TSXV'
        : 'TSX';

  // The issuer name sits immediately before the ticker bracket:
  // "Dinero Ventures Ltd (TSXV: DNO)", "Kalo Gold Corp . ( TSXV:KALO )".
  //
  // Source Rock writes it as `Source Rock Royalties Ltd. ("Source Rock")(TSXV:
  // SRR )` — the issuer's own short form sits between the name and the ticker.
  // Missing that cost a real error: with no issuer name to compare against,
  // the issuer itself was picked up as its own IR provider.
  let name: string | null = null;
  let before = text.slice(Math.max(0, m.index - 120), m.index).trim();
  while (/\([^()]*\)\s*$/.test(before)) before = before.replace(/\([^()]*\)\s*$/, '').trim();
  const nm = /([A-Z][A-Za-z0-9&'.\- ]{2,60}?)\s*\.?\s*$/.exec(before);
  if (nm) {
    name = cleanIssuerName(nm[1]);
  }
  return { name, ticker, exchange };
}

/**
 * Strip the dateline furniture some wires wrap around the issuer name.
 *
 * thenewswire.com writes "June 30'26 TheNewswire - Nord Precious Metals", so
 * the capture that ends at the ticker bracket picks up a date and a wire name
 * and those went straight onto the ranking page as the company's name.
 */
export function cleanIssuerName(raw: string): string | null {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:of|and|by|from|,|-)\s+/i, '');
  // "June 30'26 TheNewswire - X", "TheNewswire - X", "CNW - X"
  s = s.replace(
    /^.{0,24}?\b(?:TheNewswire|Newsfile|ACCESS ?Newswire|GlobeNewswire|PR ?Newswire|CNW|Business ?Wire)\b\s*[-–—:]\s*/i,
    '',
  );
  // A leading date that survived: "June 30'26 X", "Aug 1, 2026 X"
  s = s.replace(/^[A-Z][a-z]{2,8}\.?\s+\d{1,2}(?:['’]\d{2}|,?\s+\d{4})\s*[-–—:]?\s*/, '');
  s = s.replace(/^\d{1,2}\s*[-–—/]\s*\d{1,2}\s*/, '');
  s = s.trim();
  if (s.length < 3 || s.length > 70) return null;
  if (!/[A-Za-z]{3}/.test(s)) return null;
  // Whatever is left must not be the wire itself.
  if (PUBLISHER.test(s)) return null;
  return s;
}

// ── Providers ────────────────────────────────────────────────────────────

/** Legal/trade tails that mark a string as a company rather than prose. */
const ENTITY_TAIL =
  /(?:Inc|Incorporated|Ltd|Limited|LLC|L\.L\.C|LLP|LP|Corp|Corporation|GmbH|AG|S\.A|Pty|PLC|Co|Company|Group|Media|Capital|Partners|Communications?|Consulting|Consultants|Advisors|Advisory|Marketing|Ventures|Holdings|Agency|Interactive|Labs?|Networks?|Digital|Relations|Associates|Solutions|Strategies|Research)\b/;

/**
 * An entity introduced with a quoted short form: `Adelaide Capital Markets
 * Inc. ("Adelaide")`. This is the highest-signal provider shape in the corpus
 * and — unlike the verb patterns — it finds EVERY provider in a multi-provider
 * release, which is what makes per-agreement rows possible.
 *
 * The issuer introduces itself identically but with a ticker in the bracket,
 * so anything whose bracket contains an exchange code is skipped.
 */
const ENTITY_WITH_SHORT = new RegExp(
  // A run of capitalised words (small joiners allowed inside — "Outside the
  // Box Capital Inc.") ending in a corporate tail. Every word must be
  // capitalised or a joiner: that is what stops the run from swallowing the
  // prose in front of the name. Source Rock's "…effective August 1, 2022 , it
  // has engaged Brisco Capital Partners Corp. ("Brisco")" produced a provider
  // called "August 1, 2022" until this was tightened.
  '((?:(?:[A-Z][\\w&.\'’\\-]*|the|of|and|for|de|la|le|&)\\s+){1,6}' +
    '(?:Inc|Ltd|LLC|L\\.L\\.C|GmbH|AG|Corp|Corporation|Limited|Partners|Group|Capital|' +
    'Communications|Consulting|Consultants|Media|Interactive|Networks?|Advisors|Advisory|' +
    'Marketing|Agency|Associates|Solutions|Research|Ventures|Holdings|Digital)\\.?)' +
    '\\s*\\(\\s*["\'“]?\\s*([A-Za-z][A-Za-z0-9 &.\\-]{1,28}?)\\s*["\'”]?\\s*\\)',
  'g',
);

/** Verb phrasings, used when nobody was introduced with a short form. */
const PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(?:entered into|signed|executed|has)\s+(?:an?|its)\s+[^.]{0,70}?(?:agreement|contract|engagement)\s*(?:\([^)]{0,50}\))?\s*with\s+([A-Z][^.;()]{2,60})/,
    'regex:agreement-with',
  ],
  [
    /\b(?:has\s+)?(?:engaged|retained|appointed|hired|contracted)\s+([A-Z][^.;()]{2,60}?)\s*(?:\([^)]{1,30}\))?\s*(?:to\s+(?:provide|perform|act|carry out|undertake)|for|as)\b/,
    'regex:engaged-x-to',
  ],
  [
    /\bservices?\s+(?:of|from|provided by)\s+([A-Z][^.;()]{2,60})/,
    'regex:services-of',
  ],
];

/** Headline shape: "Galway Metals Engages Simone Capital Corp. for Investor
 *  Relations Services". The title is often cleaner than the body. */
const TITLE_PROVIDER =
  /\b(?:Engages|Hires|Retains|Appoints|Signs(?: With)?|Partners With|Enters? [Ii]nto .{0,40} [Ww]ith)\s+([A-Z][A-Za-z0-9&.,'\- ]{2,50}?)(?:\s+(?:for|to|as|and)\b|$)/;

const PROVIDER_STOP =
  /\b(?:the Company|its|their|our|shares?|an? |and |with |for |to provide|services|agreement|pursuant|effective|commencing|dated|which|that|a leading)\b/i;

function cleanProvider(raw: string): string | null {
  let s = raw.replace(/\s+/g, ' ').trim();
  const stop = PROVIDER_STOP.exec(s);
  if (stop && stop.index > 2) s = s.slice(0, stop.index).trim();
  s = s.replace(/[,;:]+$/, '').replace(/\s+(?:of|in|from|and)$/i, '').trim();
  // Drop connective words the surrounding sentence leaked into the capture:
  // "engagement of Robert Ferguson", "MariCom Inc. and First Canadian Capital",
  // and the "About <Firm>" section headings every wire release ends with.
  s = s.replace(/^(?:About|of|and|with|by|from)\s+/i, '').trim();
  // Keep only the leading proper-noun run. Small joiners are allowed INSIDE a
  // name — "Outside the Box Capital Inc." is a real IR firm (Hydaway Digital,
  // June 2026) and breaking the run at "the" reduced it to "Outside", which
  // then failed the single-bare-word rejection and lost the provider entirely.
  const kept: string[] = [];
  for (const w of s.split(' ')) {
    if (
      /^[A-Z0-9&(]/.test(w) ||
      ENTITY_TAIL.test(w) ||
      (kept.length > 0 && /^(?:de|von|van|del|la|le|of|and|the|for|&)$/i.test(w))
    ) {
      kept.push(w);
    } else break;
  }
  s = kept.join(' ').replace(/[.,;:]+$/, '').trim();
  // "the Howard Group" — the headline shape keeps the article; the firm does
  // not. Strip it so it collapses with "Howard Group" in the ir_firms table.
  s = s.replace(/^(?:the|The)\s+/, '').trim();
  if (s.length < 4 || s.length > 70) return null;
  if (!/[A-Za-z]{3}/.test(s)) return null;
  if (/^(?:this|that|it|we|its|a|an)\b/i.test(s)) return null;

  // ── Rejections paid for by the corpus ──────────────────────────────────
  // A date. "…effective April 15, 2026, the Company has engaged…" produced a
  // provider called "April 15, 2026" on Gensource Potash.
  if (/\b(19|20)\d{2}\b/.test(s)) return null;
  if (new RegExp(`^(?:${Object.keys(MONTHS).join('|')})\\b`, 'i').test(s)) return null;
  // The activity, not the actor. Nord Precious Metals yielded a provider
  // literally named "Investor Relations".
  if (ACTIVITY.test(s) && !ENTITY_TAIL.test(s)) return null;
  // A single bare word with nothing corporate about it is prose that survived
  // the run ("Outside", "Walk"). A real one-word firm still carries a tail
  // ("Senergy Communications"), and a person's name has two words.
  if (!/\s/.test(s) && !ENTITY_TAIL.test(s)) return null;
  // The wire or the republisher is not the IR firm. Their names appear in the
  // dateline and the page furniture of every release we read, and Investing
  // News Network duly turned up as Spartan Metals' investor-relations
  // provider.
  if (PUBLISHER.test(s)) return null;
  return s;
}

/** Wires, republishers and aggregators — never the counterparty. */
const PUBLISHER =
  /^(?:Investing News Network|Newsfile|ACCESS ?Newswire|ACCESSWIRE|GlobeNewswire|GLOBE NEWSWIRE|PR ?Newswire|CNW ?Group|Business ?Wire|Stock ?Titan|The Globe and Mail|Yahoo|TradingView|Junior Mining Network|The Newswire|Kalkine)/i;

interface ProviderHit {
  name: string;
  short: string | null;
  at: number;
  how: string;
}

function findProviders(title: string, text: string, issuerName: string | null): ProviderHit[] {
  const hits: ProviderHit[] = [];
  const seen = new Set<string>();
  const issuerKey = issuerName ? issuerName.toLowerCase().slice(0, 10) : null;

  const push = (name: string | null, short: string | null, at: number, how: string) => {
    if (!name) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || seen.has(key)) return;
    // The issuer is never its own IR provider, and it is named all over its
    // own release — including inside strings that survive the capture, like
    // Gensource Potash's "GDG, Gensource".
    if (issuerKey) {
      const ik = issuerKey.replace(/[^a-z0-9]/g, '');
      if (ik.length > 3 && key.includes(ik)) return;
    }
    seen.add(key);
    hits.push({ name, short, at, how });
  };

  ENTITY_WITH_SHORT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTITY_WITH_SHORT.exec(text))) {
    const bracket = m[2];
    // Ticker bracket ⇒ that is the issuer (or a cross-listing), not a provider.
    if (/^(?:TSX|TSXV|CSE|CNSX|NEO|OTC|OTCQB|OTCQX|NASDAQ|NYSE|FSE|FRA|WKN|ISIN)\b/i.test(bracket)) continue;
    // "the Company", "the Agreement", "the Offering" — self-reference, not a firm.
    if (/^(?:the\s+)?(?:company|agreement|issuer|offering|corporation|transaction|plan|board|exchange)$/i.test(bracket)) continue;
    push(cleanProvider(m[1]), bracket.trim(), m.index, 'regex:entity-with-short');
  }

  if (!hits.length) {
    for (const [re, how] of PROVIDER_PATTERNS) {
      const mm = re.exec(text);
      if (mm) push(cleanProvider(mm[1]), null, mm.index, how);
      if (hits.length) break;
    }
  }
  if (!hits.length) {
    const tm = TITLE_PROVIDER.exec(title);
    if (tm) push(cleanProvider(tm[1]), null, 0, 'regex:title');
  }
  return hits.sort((a, b) => a.at - b.at);
}

/**
 * The slice of the release that belongs to one provider.
 *
 * Multi-provider releases are written as sections — each provider named, then
 * its own term and fee — so a provider's numbers live between its first
 * mention and the next provider's. With a single provider the window is the
 * whole release, because the fee is often paragraphs from the name.
 */
function windowFor(text: string, hits: ProviderHit[], i: number): string {
  if (hits.length <= 1) return text;
  // A provider's section runs from its own heading to the next provider's.
  // The first provider also gets the lead paragraph, which is where the
  // issuer explains what all the agreements are.
  //
  // Both boundaries were paid for on Kalo Gold: an earlier version backed the
  // end off by 100 characters and lost Fairfax's fee (it sits in the last
  // sentence before the next heading), and started 200 characters early,
  // which handed NAI the six-month term belonging to GOLDINVEST.
  const start = i === 0 ? 0 : hits[i].at;
  const end = i + 1 < hits.length ? hits[i + 1].at : text.length;
  return text.slice(start, Math.max(start + 120, end));
}

// ── Kind ─────────────────────────────────────────────────────────────────

/**
 * Read this off the HEADLINE first.
 *
 * Bodies are full of innocent "unless terminated in accordance with its terms"
 * boilerplate — IC Group's brand-new six-month engagement was classified as a
 * termination on exactly that phrase. Only an explicit "announces the
 * termination of" in the body is allowed to override a neutral headline.
 */
function findKind(title: string, text: string): AgreementKind {
  if (/\bterminat(?:e|es|ed|ion)\b/i.test(title)) return 'termination';
  if (/\b(?:extension|extends?|renew(?:ed|al|s)?)\b/i.test(title)) return 'extension';
  if (/\b(?:amend(?:ed|ment|s)?|revis(?:ed|ion)|clarif)/i.test(title)) return 'amendment';
  const lead = text.slice(0, 1200);
  if (/\bannounces?\s+the\s+terminat|\bhas\s+terminated\b/i.test(lead)) return 'termination';
  if (/\bannounces?\s+(?:an?\s+)?(?:extension|renewal)\b/i.test(lead)) return 'extension';
  if (/\bannounces?\s+(?:an?\s+)?amend/i.test(lead)) return 'amendment';
  return 'new';
}

// ── Term ─────────────────────────────────────────────────────────────────

function findTerm(text: string): { months: number | null; how: string } {
  const patterns: Array<[RegExp, string]> = [
    [/\b(?:initial\s+)?term\s+of\s+(?:approximately\s+)?([a-z\-]+|\d+)\s*(?:\(\s*\d+\s*\))?\s*(month|year|week)/i, 'regex:term-of'],
    [/\b(?:for|over)\s+(?:an?\s+)?([a-z\-]+|\d+)[-\s]?(month|year)\s+(?:term|period|engagement|contract|agreement)/i, 'regex:n-month-term'],
    [/\b(?:an?|the)\s+(?:initial\s+)?([a-z\-]+|\d+)[-\s]?(month|year)\s+(?:term|period|agreement|engagement|contract)/i, 'regex:a-n-month'],
    [/\bperiod\s+of\s+([a-z\-]+|\d+)\s*(?:\(\s*\d+\s*\))?\s*(month|year)s?\b/i, 'regex:period-of'],
    [/\bfor\s+([a-z\-]+|\d+)\s*(?:\(\s*\d+\s*\))?\s*(month|year)s?\s+(?:commencing|beginning|from|effective)/i, 'regex:for-n-commencing'],
    [/\bon\s+an?\s+([a-z\-]+|\d+)[-\s]?(month|year)\s+basis/i, 'regex:on-basis'],
  ];
  for (const [re, how] of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    // The capture class includes the hyphen, so the backtrack that finally
    // matches "three-month term" leaves "three-" in group 1.
    const word = m[1].toLowerCase().replace(/[-\s]+$/, '');
    const n = /^\d+$/.test(word) ? Number(word) : WORD_NUM[word];
    if (!n || n > 120) continue;
    const unit = m[2].toLowerCase();
    const months = unit === 'year' ? n * 12 : unit === 'week' ? Math.round(n / 4.345) : n;
    if (months < 1 || months > 120) continue;
    // "…grant Brisco 200,000 stock options … for a period of 5 years at a
    // price of $0.90" is an OPTION LIFE, not a contract term. Oceanic and
    // Source Rock both became 60-month "agreements" on exactly that sentence.
    // If the matched phrase sits in an options/warrants clause, keep looking.
    const around = text.slice(Math.max(0, m.index - 120), m.index + m[0].length + 60);
    if (/\b(?:option|warrant|expir|vest)/i.test(around) && !/\b(?:agreement|engagement|contract|services)\b/i.test(around)) {
      continue;
    }
    return { months, how };
  }
  // "month-to-month" is a real, common term shape (Galway/Simone Capital) and
  // it is NOT an unknown term — it is one month, renewing.
  if (/\bmonth[- ]to[- ]month\b/i.test(text)) return { months: 1, how: 'regex:month-to-month' };
  return { months: null, how: '' };
}

// ── Fees ─────────────────────────────────────────────────────────────────

const MONTHLY_LEADS: Array<[RegExp, string]> = [
  [/monthly\s+(?:cash\s+)?(?:fee|payment|retainer|rate|compensation|amount|sum)\s+of\s+([^.;]{2,50})/i, 'regex:monthly-fee-of'],
  [/(?:fee|rate|cost|compensation|payment|retainer|sum)s?\s+of\s+([^.;]{2,45}?)\s*(?:per|\/|a|each)\s+month/i, 'regex:fee-of-per-month'],
  [/((?:(?:CAD|CDN|C|US|USD|U\.S\.|EUR|GBP)\s*)?\$\s*[\d][\d,]*(?:\.\d{2})?)\s*(?:\+[^.]{0,20})?\s*(?:per|\/|a|each)\s+month/i, 'regex:amount-per-month'],
  [/\$\s*([\d][\d,]*(?:\.\d{2})?)\s*(?:per|\/)\s*mo\b/i, 'regex:amount-per-mo'],
  [/(?:pay|paid|payable)[^.;]{0,40}?([^.;]{2,40}?)\s+(?:per|each|a)\s+month/i, 'regex:pay-per-month'],
];

const TOTAL_LEADS: Array<[RegExp, string]> = [
  [/total\s+(?:costs?|cost of|compensation|consideration|value|fees?|amount|contract value)\s+(?:of|is|will be|:)?\s*([^.;]{2,50})/i, 'regex:total-of'],
  [/(?:aggregate|overall)\s+(?:compensation|consideration|fees?|amount|value)\s+of\s+([^.;]{2,50})/i, 'regex:aggregate-of'],
  [/for\s+(?:a\s+)?total\s+of\s+([^.;]{2,50})/i, 'regex:for-a-total-of'],
  [/(?:fee|consideration)\s+of\s+([^.;]{2,45}?)\s+for\s+the\s+(?:term|engagement|contract|agreement|period)/i, 'regex:fee-for-the-term'],
  [/will\s+(?:be\s+paid|receive|pay)\s+([^.;]{2,40}?)\s+(?:for|in\s+consideration|over\s+the)/i, 'regex:will-be-paid'],
  // Last and loosest: "Kalo will pay GOLDINVEST a total of EUR 60,000."
  // It has to come after the specific leads, or it would win over them and
  // lose the qualifier that tells a contract value from a financing.
  [/\ba\s+total\s+of\s+([^.;]{2,50})/i, 'regex:a-total-of'],
];

function findFees(text: string) {
  let monthly: Money | null = null;
  let howMonthly = '';
  for (const [re, how] of MONTHLY_LEADS) {
    const m = re.exec(text);
    if (!m) continue;
    const money = parseMoney(m[1] ?? m[0]);
    if (money) {
      monthly = money;
      howMonthly = how;
      break;
    }
  }
  let total: Money | null = null;
  let howTotal = '';
  for (const [re, how] of TOTAL_LEADS) {
    const m = re.exec(text);
    if (!m) continue;
    const money = parseMoney(m[1]);
    if (money) {
      total = money;
      howTotal = how;
      break;
    }
  }
  return { monthly, total, howMonthly, howTotal };
}

// ── Securities paid to the provider ──────────────────────────────────────

/**
 * The single most dangerous field in this dataset.
 *
 * These releases very often bundle an unrelated company-wide option grant into
 * the same announcement — Dinero's 1,300,000 options went to "directors and
 * consultants", while the release says in the very next breath that the IR
 * firm gets none. Attributing those to the promoter would invent a six-figure
 * dilution number, and §2.4 scores "options granted to promoters".
 *
 * So: work sentence by sentence, and only count a grant when the SAME sentence
 * names this provider. An explicit denial wins outright — Policy 3.4 Part 5
 * limits security-based IR compensation to stock options, so issuers say so
 * plainly when none are paid.
 */
const DENIAL =
  /\b(?:will\s+not|shall\s+not|does\s+not|are\s+not|no)\s+(?:be\s+)?(?:receive|granted|issued|paid|entitled|issuable)?[^.]{0,50}?(?:shares?|options?|warrants?|securities|equity[- ]based)/i;

function findSecurities(text: string, provider: string | null, short: string | null) {
  const denied = DENIAL.test(text);
  const keys: string[] = [];
  if (provider) keys.push(provider.toLowerCase().split(' ').slice(0, 2).join(' '));
  if (short) keys.push(short.toLowerCase());

  let options: number | null = null;
  let strike: number | null = null;
  let shares: number | null = null;
  let how = '';

  for (const s of sentences(text)) {
    const low = s.toLowerCase();
    const namesProvider =
      keys.some((k) => k.length > 3 && low.includes(k)) ||
      /\b(?:the\s+)?(?:consultant|ir (?:firm|provider|consultant)|service provider)\b/i.test(s);
    if (!namesProvider) continue;
    if (/\b(?:will not|shall not|does not receive|no options|no shares|no securities)\b/i.test(s)) continue;

    const om = /\b([\d][\d,]{2,})\s+(?:incentive\s+)?(?:stock\s+)?options\b/i.exec(s);
    if (om && options == null) {
      const n = Number(om[1].replace(/,/g, ''));
      if (n > 0 && n < 1e9) {
        options = n;
        how = 'regex:options-in-provider-sentence';
      }
    }
    const sm = /\b([\d][\d,]{2,})\s+(?:common\s+)?shares\b/i.exec(s);
    if (sm && shares == null) {
      const n = Number(sm[1].replace(/,/g, ''));
      if (n > 0 && n < 1e9) shares = n;
    }
    const km = /exercis(?:able|e price)[^.]{0,30}?\$\s*([\d.]+)/i.exec(s);
    if (km && strike == null) {
      const v = Number(km[1]);
      if (v > 0 && v < 1000) strike = v;
    }
  }
  return { options, strike, shares, denied, how };
}

// ── Arm's length ─────────────────────────────────────────────────────────

function findArmsLength(text: string): boolean | null {
  if (/\bnot\s+(?:at\s+)?arm'?s?[- ]length\b/i.test(text)) return false;
  if (/\bnon[- ]arm'?s?[- ]length\b/i.test(text)) return false;
  if (/\barm'?s?[- ]length\b/i.test(text)) return true;
  return null;
}

// ── The parse ────────────────────────────────────────────────────────────

export function parseDisclosure(title: string, body: string): ParsedDisclosure {
  const text = narrow(body);
  const notes: string[] = [];
  const issuer = findIssuer(text);
  const kind = findKind(title, text);
  const hits = findProviders(title, text, issuer.name);

  const agreements: ParsedAgreement[] = hits.length
    ? hits.map((h, i) => buildAgreement(windowFor(text, hits, i), text, h))
    : [buildAgreement(text, text, null)];

  if (!issuer.ticker) notes.push('No Canadian exchange ticker found — cannot attach to an issuer.');
  if (hits.length > 1) notes.push(`${hits.length} providers disclosed in one release.`);

  let confidence = agreements.length
    ? Math.min(...agreements.map((a) => a.confidence))
    : 0;
  if (!issuer.ticker) confidence = Math.min(confidence, 0.3);
  if (!issuer.name) confidence -= 0.04;
  // Some republishers (Investing News Network in particular) serve the
  // article body lazily, so what we fetched is mostly site navigation with the
  // release somewhere below. `narrow` cannot find a dateline in those, and
  // whatever the field extractors return came from chrome. Send them to
  // review rather than trusting them.
  if (!isolated(text)) {
    confidence = Math.min(confidence, 0.5);
    notes.push('Could not isolate the release body from the page — fields may come from page chrome.');
  }

  return {
    ticker: issuer.ticker,
    exchange: issuer.exchange,
    issuerName: issuer.name,
    kind,
    agreements,
    confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(3)))),
    notes,
  };
}

function buildAgreement(win: string, full: string, hit: ProviderHit | null): ParsedAgreement {
  const provenance: Record<string, string> = {};
  const notes: string[] = [];
  if (hit) provenance.providerName = hit.how;

  const term = findTerm(win);
  if (term.months) provenance.termMonths = term.how;

  const fees = findFees(win);
  if (fees.monthly) provenance.monthlyFee = fees.howMonthly;
  if (fees.total) provenance.totalValue = fees.howTotal;

  const sec = findSecurities(win, hit?.name ?? null, hit?.short ?? null);
  if (sec.options) provenance.optionsGranted = sec.how;

  const startDate = findDate(
    win,
    /(?:contract\s+)?start\s+date\s+is[^.]{0,40}/i,
    /(?:commenc(?:ing|es|ed)|effective|beginning|begins|start(?:ing|s)?)\s+(?:on\s+)?[^.]{0,30}/i,
    /\bdated\s+[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}/,
    /\bfrom\s+[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}/,
  );
  if (startDate) provenance.startDate = 'regex:start-lead';

  const endDate = findDate(
    win,
    /(?:expir(?:ing|es|e|y)|terminat(?:ing|es|e)\s+on|until|through|ending)\s+(?:on\s+)?[^.]{0,30}/i,
  );
  if (endDate) provenance.endDate = 'regex:end-lead';

  // Currency: whichever mark the fee carried; else CAD, because a TSXV/CSE
  // issuer quoting a bare "$" in a Policy 3.4 release is quoting Canadian
  // dollars. Recorded as an assumption so a reviewer can see it was not read
  // off the page.
  let currency: Currency | null = fees.monthly?.currency ?? fees.total?.currency ?? null;
  if (!currency && (fees.monthly || fees.total)) {
    currency = 'CAD';
    provenance.currency = 'assumed:cad-venture-issuer';
    notes.push('Currency not stated; assumed CAD for a Canadian venture issuer.');
  } else if (currency) {
    provenance.currency = 'regex:currency-mark';
  }

  let monthlyFee = fees.monthly?.amount ?? null;
  let totalValue = fees.total?.amount ?? null;
  if (monthlyFee != null && totalValue == null && term.months) {
    totalValue = Math.round(monthlyFee * term.months);
    provenance.totalValue = 'derived:monthly*term';
  } else if (totalValue != null && monthlyFee == null && term.months && term.months > 0) {
    monthlyFee = Math.round(totalValue / term.months);
    provenance.monthlyFee = 'derived:total/term';
  }

  const agreement: ParsedAgreement = {
    providerName: hit?.name ?? null,
    providerShort: hit?.short ?? null,
    startDate,
    endDate,
    termMonths: term.months,
    monthlyFee,
    totalValue,
    currency,
    optionsGranted: sec.denied && !sec.options ? 0 : sec.options,
    optionStrike: sec.strike,
    sharesGranted: sec.denied && !sec.shares ? 0 : sec.shares,
    noSecurityCompensation: sec.denied,
    // Arm's-length is nearly always stated once for the whole release.
    armsLength: findArmsLength(win) ?? findArmsLength(full),
    confidence: 0,
    provenance,
    notes,
  };
  agreement.confidence = score(agreement, notes);
  return agreement;
}

/**
 * Confidence = how much of the §2.3 field list we actually read off the page,
 * weighted by what the product needs. Without a provider the row is not a
 * contract; without money it cannot enter a spend total. Options and arm's
 * length are context.
 *
 * The issuer-level ticker is scored in `parseDisclosure`, not here, because it
 * is shared by every agreement in a release.
 */
function score(a: ParsedAgreement, notes: string[]): number {
  let s = 0.28; // issuer-level fields are scored by the caller
  if (a.providerName) s += 0.3;
  else notes.push('Provider name not found.');
  if (a.monthlyFee != null || a.totalValue != null) s += 0.24;
  else notes.push('No fee figure found.');
  if (a.termMonths != null) s += 0.1;
  else notes.push('Term not found.');
  if (a.startDate) s += 0.04;
  if (a.optionsGranted != null || a.noSecurityCompensation) s += 0.02;
  if (a.armsLength != null) s += 0.02;
  if (a.provenance.totalValue?.startsWith('derived') && a.provenance.monthlyFee?.startsWith('derived')) {
    s -= 0.05;
  }
  return Math.max(0, Math.min(1, Number(s.toFixed(3))));
}

/**
 * Trim wire chrome down to the release body.
 *
 * Start: the dateline. Every wire writes it differently and the corpus has all
 * of these — Newsfile's "Toronto, Ontario--(Newsfile Corp. - August 4, 2026) -",
 * ACCESS Newswire's "VANCOUVER, BC / ACCESS Newswire / May 5, 2025 /", CNW's
 * "TORONTO , Aug. 1, 2023 /CNW/ -", GlobeNewswire's bracketed variant.
 *
 * End: the exchange boilerplate, the source-version line, or the site's
 * "Recent News" rail — whichever comes first. Without the end cut, the rail's
 * other headlines leak into the parse and other companies' tickers win.
 */
/** Did `narrow` actually land on a release, or is this still a web page? */
const CHROME =
  /(Connect with us|Privacy Policy|Browse Topics|Share this article|Raven\.config|Manage Subscriptions|Cookie Settings|Newsroom)/i;

export function isolated(text: string): boolean {
  const head = text.slice(0, 400);
  if (CHROME.test(head)) return false;
  // A dateline is a place, a wire and a date within the first few lines.
  return /[A-Z][A-Za-z .'-]{2,40}\s*[,/—–-]/.test(head) && /\b(19|20)\d{2}\b/.test(text.slice(0, 900));
}

export function narrow(body: string): string {
  let t = body.replace(/\r/g, '');
  const starts: RegExp[] = [
    /[A-Z][A-Za-z .'-]{2,40},\s*[A-Za-z .]{2,30}-{1,2}\(\s*(?:Newsfile Corp\.|GLOBE NEWSWIRE|ACCESS Newswire|ACCESSWIRE|Business Wire|CNW)/,
    /[A-Z][A-Za-z .'-]{2,40},\s*[A-Z]{2}\s*\/\s*(?:ACCESS Newswire|ACCESSWIRE|EINPresswire|Newsfile)\s*\//i,
    /[A-Z][A-Za-z .'-]{2,40}\s*,\s*[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}\s*\/(?:CNW|PRNewswire)/,
    /\/(?:CNW|PRNewswire)[^/]{0,40}\/\s*-/,
    /[A-Z][A-Za-z .'-]{2,40},\s*[A-Za-z .]{2,30}\s*[-–—]{1,2}\s*\(?[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}\)?\s*[-–—]/,
  ];
  for (const re of starts) {
    const m = re.exec(t);
    if (m && m.index < t.length * 0.92) {
      t = t.slice(m.index);
      break;
    }
  }
  const ends = [
    /Neither (?:the )?TSX Venture Exchange nor/i,
    /The (?:Canadian Securities Exchange|CSE) has (?:not|neither)/i,
    /To view the source version of this press release/i,
    /\bRecent News\b/,
    /Get News by Email/i,
    /SOURCE\s+[A-Z][A-Za-z .,'-]{3,50}\s*$/m,
  ];
  let cut = t.length;
  for (const re of ends) {
    const m = re.exec(t);
    if (m && m.index > 200) cut = Math.min(cut, m.index);
  }
  return t.slice(0, cut).trim();
}
