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
  /** The legal entity behind a trade name: "GRA Enterprises LLC" for
   *  "National Inflation Association". Null when the release gave one name. */
  providerLegalName: string | null;
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
  if (!hasIrParagraph(title, text)) return false;
  // v1 is Canada only. No Canadian listing anywhere in the release ⇒ not our
  // universe; this is what keeps US IR-hire announcements (Delek, Harmonix,
  // Siguler Guff — all in the discovery feed) out of the dataset.
  return CA_TICKER.test(text);
}

/**
 * Does the release announce an IR-type engagement ANYWHERE in its body?
 *
 * The first version only read the lead (2,200 characters), on the assumption
 * that an IR hire is the subject of its own release. Elevate Service Group
 * (TSXV: SERV, September 4, 2026) showed the other shape: a "corporate
 * updates" release — OTCQB listing, DTC eligibility, an option grant, AGM
 * results — with a US$250,000 investor relations agreement in its fifth
 * section, 2,600 characters in. The gate rejected it.
 *
 * So the test is per paragraph, over the whole body: an activity word and an
 * agreement word in the same paragraph. Paragraph-level rather than
 * body-level so that a contact block ("Investor Relations: ir@…") plus an
 * unrelated "option agreement" three sections away does not pass.
 */
export function hasIrParagraph(title: string, text: string): boolean {
  if (ACTIVITY.test(title) && AGREEMENT.test(title)) return true;
  for (const p of paragraphs(text)) {
    if (ACTIVITY.test(p) && AGREEMENT.test(p)) return true;
  }
  return false;
}

/** `htmlToText` ends every block element with a newline, so a paragraph is a
 *  line. A wire that flattened the release onto one line still passes — the
 *  whole body is then one paragraph, which is the old body-level test. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
}

/**
 * The release's own date, read off the dateline `narrow` puts first —
 * "Toronto, Ontario--(Newsfile Corp. - September 4, 2026) -". Used when a
 * release arrives by URL rather than through the dated Google News feed.
 */
export function releaseDate(body: string): string | null {
  const head = narrow(body).slice(0, 260);
  const m = DATE_RE.exec(head);
  if (m) return toIso(m[1], m[2], m[3]);
  const short = /([A-Z][a-z]{2,8})\.?\s+(\d{1,2})'(\d{2})\b/.exec(head); // "June 30'26"
  return short ? toIso(short[1], short[2], `20${short[3]}`) : null;
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
  /** Where the ticker bracket sits in the text; -1 when none. */
  at: number;
} {
  const m = CA_TICKER.exec(text);
  if (!m) return { name: null, ticker: null, exchange: null, at: -1 };
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
  return { name, ticker, exchange, at: m.index };
}

/**
 * The issuer in an AGGREGATOR headline — "Elevate Service Group Begins OTCQB
 * Trading as ESVCF, Grants Stock Options and Signs Investor Relations
 * Agreement" (kalkine.ca), "Elevate Service Group Inc. (TSXV:SERV) Falls
 * 2.91%…". Aggregators rewrite headlines around the news, so the only stable
 * part is the company name at the front. Used by discovery to go and find the
 * wire's own copy of a release the aggregator surfaced.
 */
const HEADLINE_CUT =
  /\s+(?:\(|Inc\b|Ltd\b|Corp\b|Co\b|Limited\b|Corporation\b|plc\b|Begins?|Commences?|Signs?|Engages?|Retains?|Hires?|Announces?|Enters?|Appoints?|Reports?|Grants?|Provides?|Completes?|Closes?|Expands?|Launches|Starts?|Adds?|Secures?|Renews?|Extends?|Terminates?|Partners?|Taps|Names|Gains?|Falls?|Climbs?|Slips?|Surges?|Drops?|Jumps?|Rises?|Stock\b|Shares?\b|Files?|Posts?|to\b|:|—|–|-\s)/;

export function issuerFromHeadline(title: string): string | null {
  const t = title.replace(/\s+/g, ' ').trim();
  const m = HEADLINE_CUT.exec(t);
  const name = (m ? t.slice(0, m.index) : t).replace(/[,.:;]+$/, '').trim();
  if (name.length < 4 || name.length > 60) return null;
  if (!/[A-Za-z]{3}/.test(name)) return null;
  if (PUBLISHER.test(name)) return null;
  return name;
}

/** Leading company name in a release headline, up to the announcing verb. */
const TITLE_VERB =
  /\b(?:Announces?|Announced|Engages?|Enters?|Entered|Retains?|Hires?|Appoints?|Signs?|Provides?|Extends?|Renews?|Terminates?|Completes?|Commences?|Reports?|Updates?|to\s+Participate|Begins?)\b/;

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
  // A company name does not contain an announcing verb. When a republisher
  // serves the body lazily, the text before the ticker is its own headline
  // and navigation, which yielded issuers called "IC Group Engages Adelaide
  // Capital Investing News Network". Reject those so the headline fallback
  // gets its turn.
  if (TITLE_VERB.test(s)) return null;
  if (s.split(/\s+/).length > 7) return null;
  return s;
}

function issuerFromTitle(title: string): string | null {
  const t = String(title || '').split(' - ')[0].trim();
  const m = TITLE_VERB.exec(t);
  const head = (m ? t.slice(0, m.index) : t).trim();
  if (!head || head.length < 3) return null;
  // Must read as a name: capitalised words only, nothing sentence-like.
  const words = head.split(/\s+/);
  if (words.length > 7) return null;
  if (!words.every((w) => /^[A-Z0-9(&]/.test(w) || /^(?:the|of|and|for|de|la|le|&)$/i.test(w))) return null;
  return cleanIssuerName(head);
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

/**
 * A run of name text that may contain a period only where a name does: inside
 * an abbreviation ("B.C", "L.L.C") or before a DBA clause ("Ltd. DBA …").
 * A period followed by a space and a new sentence ends the run, so "Adelaide
 * Capital Markets Inc. Under the terms…" stops at "Inc".
 */
const NAME_RUN = String.raw`[A-Z0-9](?:[^.;()]|\.(?=[A-Za-z])|\.(?=,?\s+(?:DBA|dba|d\/b\/a|doing business as|operating as)\b))*?`;

/** Verb phrasings, used when nobody was introduced with a short form. */
const PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(?:entered into|signed|executed|has)\s+(?:an?|its)\s+[^.]{0,70}?(?:agreement|contract|engagement)\s*(?:\([^)]{0,50}\))?\s*with\s+([A-Z][^.;()]{2,90})/,
    'regex:agreement-with',
  ],
  [
    /\b(?:has\s+)?(?:engaged|retained|appointed|hired|contracted)\s+([A-Z][^.;()]{2,90}?)\s*(?:\([^)]{1,30}\))?\s*(?:to\s+(?:provide|perform|act|carry out|undertake)|for|as)\b/,
    'regex:engaged-x-to',
  ],
  [
    // "the engagement of BoxTop Integrated Communications to provide…",
    // "the appointment of Port Guichon Strategic Advisory, as Investor
    // Relations…" — the noun form the verb patterns above never saw.
    new RegExp(
      String.raw`\b(?:engagement|appointment|retention|hiring)\s+of\s+(` + NAME_RUN + String.raw`),?\s*(?:\([^)]{1,30}\))?\s*,?\s*(?:to\s+(?:provide|perform|act|carry out|undertake|assist)|as|for)\b`,
      'g',
    ),
    'regex:engagement-of',
  ],
  [
    // "…entered into an investor relations agreement (the IR Agreement),
    // effective October 1, 2024, with Triomphe Holdings Ltd., doing business
    // as Capital Analytica" / "the extension of its investor relations
    // agreement with Triomphe…" — the defined term and the date sit between
    // "agreement" and "with", which the first pattern above never allowed.
    new RegExp(
      String.raw`\bagreements?\s*(?:\([^)]{0,60}\))?\s*,?\s*(?:(?:effective|dated|commencing)\s+(?:on\s+)?[A-Z][a-z]+\s+\d{1,2},?\s+\d{4},?\s*)?with\s+(` +
        NAME_RUN +
        String.raw`)(?=\s*[(;]|,(?!\s*(?:DBA|dba|d\/b\/a|doing business as|operating as)\b)|\s+(?:to|for|effective|pursuant|under|commencing|whereby|dated)\b|(?<!business|operating|trading)\s+as\b|\.(?!\S)(?!,?\s+(?:DBA|dba|d\/b\/a|doing business as|operating as)\b)|$)`,
    ),
    'regex:agreement-with-dated',
  ],
  [
    // "the investor relations services of 1123963 B.C Ltd. DBA Capitaliz On
    // It" — a numbered company starts with a digit, not a capital.
    new RegExp(String.raw`\bservices?\s+(?:of|from|provided by)\s+(` + NAME_RUN + String.raw`)(?=\s*[(;]|,(?!\s*(?:DBA|dba|d\/b\/a|doing business as|operating as)\b)|\s+(?:to|for|effective|pursuant|under|commencing)\b|(?<!business|operating|trading)\s+as\b|\.(?!\S)(?!\s+(?:DBA|dba|d\/b\/a|doing business as|operating as)\b)|$)`),
    'regex:services-of',
  ],
];

/** Headline shape: "Galway Metals Engages Simone Capital Corp. for Investor
 *  Relations Services". The title is often cleaner than the body. */
const TITLE_PROVIDER =
  /\b(?:Engages|Hires|Retains|Appoints|Signs(?: With)?|Partners With|Enters? [Ii]nto .{0,40} [Ww]ith)\s+([A-Z][A-Za-z0-9&.'\- ]{2,50}?)(?:\s*,|\s+(?:for|to|as|and)\b|$)/;

const PROVIDER_STOP =
  /\b(?:the Company|its|their|our|shares?|an? |and |with |for |to provide|services|agreement|pursuant|effective|commencing|dated|which|that|a leading)\b/i;

/**
 * "Legal Name DBA Trade Name" in its several spellings. The trade name is
 * what investors know — National Inflation Association, Capital Analytica,
 * Capitaliz On It — so it becomes the firm; the legal entity is kept as an
 * alias so a later release that names only the legal entity lands on the
 * same firm.
 */
const DBA_RE = /^(.{3,80}?)\s*,?\s*(?:\bd\.?b\.?a\.?\b|\bd\/b\/a\b|doing business as|operating as|\bo\/a\b|trading as)\s+(.{3,80})$/i;
const DBA_PAREN_RE = /^(.{3,80}?)\s*\(\s*(?:dba|d\/b\/a|doing business as|operating as)\s+([^)]{3,80})\)\s*$/i;

export function splitDba(name: string): { legal: string; trade: string } | null {
  const m = DBA_PAREN_RE.exec(name) || DBA_RE.exec(name);
  if (!m) return null;
  const legal = m[1].replace(/[,;:]+$/, '').trim();
  const trade = m[2].replace(/^["'“]+|["'”)]+$/g, '').replace(/[,;:]+$/, '').trim();
  return legal.length >= 3 && trade.length >= 3 ? { legal, trade } : null;
}

/** "Vancouver-based", "Ontario-based", "Toronto, Ontario-based" — the
 *  geography leaks into the capture because it is capitalised. */
const LOCATION_PREFIX = /^(?:[A-Z][A-Za-z.]+(?:,? [A-Z][A-Za-z.]+)?-based)\s+/;
/** "Robert Ferguson of Freeform Communications Inc." — the person is the
 *  contact, the firm is the counterparty. */
const PERSON_OF_FIRM = /^([A-Z][a-z]+(?: [A-Z]\.)?(?: [A-Z][a-z'’-]+){1,2}) of ((?:[A-Z0-9][^ ]* ?){1,7})$/;

/**
 * Words that describe the service, not the vendor. A name made only of these
 * (plus joiners and corporate suffixes) is the activity wearing a capital
 * letter — "Investor Relations", "Investor Relations Services", "Corporate
 * Communications" — and is rejected even when it ends in a corporate tail.
 * District Copper's "Engages Investor Relations Services" headline produced
 * a firm literally called "Investor Relations" (George, 2026-09-16).
 */
const GENERIC_WORDS = new Set([
  'investor', 'investors', 'relation', 'relations', 'service', 'services', 'marketing', 'market', 'markets',
  'maker', 'making', 'capital', 'communication', 'communications', 'digital', 'media', 'consulting', 'consultant',
  'consultants', 'corporate', 'strategic', 'advisory', 'advisors', 'advisor', 'awareness', 'provider', 'providers',
  'agency', 'firm', 'group', 'company', 'program', 'campaign', 'outreach', 'public', 'pr', 'ir', 'shareholder',
  'shareholders', 'financial', 'business', 'development', 'promotional', 'promotion', 'liquidity', 'trading',
  'inc', 'ltd', 'llc', 'corp', 'corporation', 'limited', 'the', 'and', 'of', 'for', '&', 'a', 'an', 'to', 'its',
  // Headline verbs and nouns that leak into a title capture.
  'team', 'expands', 'launches', 'announces', 'announce', 'initiates', 'completes', 'appoints', 'engages', 'retains',
  'hires', 'signs', 'with', 'new', 'partner', 'partners', 'partnership', 'partnerships', 'update', 'campaign',
]);

export function isGenericProviderName(name: string): boolean {
  const words = name
    .toLowerCase()
    .replace(/[.,()"'’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC_WORDS.has(w));
}

/** The canonical firm name for a raw capture: trade name over legal name,
 *  no geography, no contact person. Shared with the slug so variants merge. */
export function normalizeFirmName(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(LOCATION_PREFIX, '').trim();
  const dba = splitDba(s);
  if (dba) s = dba.trade;
  const pf = PERSON_OF_FIRM.exec(s);
  if (pf && ENTITY_TAIL.test(pf[2])) s = pf[2].trim();
  // A bracketed abbreviation after the name — "(ITG)", "(VLP)", "(AGORACOM)"
  // — is the short form, not part of the name; the same firm without it must
  // collapse onto the same row.
  s = s.replace(/\s*\((?:[A-Z][A-Z0-9&.\- ]{1,20})\)/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:the|The)\s+/, '').replace(/[.,;:]+$/, '').trim();
  return s;
}

function cleanProvider(raw: string): string | null {
  let s = raw.replace(/\s+/g, ' ').trim();
  const stop = PROVIDER_STOP.exec(s);
  if (stop && stop.index > 2) s = s.slice(0, stop.index).trim();
  // "Triomphe Holdings Ltd., doing business as Capital Analytica" — the
  // lowercase clause would end the proper-noun run below at "Ltd.", losing
  // the trade name. Resolve it first; the legal name travels separately.
  const dbaEarly = splitDba(s);
  if (dbaEarly) s = dbaEarly.trade;
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
  // Geography, contact person and DBA clauses come off here so every later
  // check — and the firm slug — sees the same canonical name.
  s = normalizeFirmName(s);
  if (s.length < 4 || s.length > 70) return null;
  // The activity, not the actor — even when it ends in "Relations" or
  // "Communications", which ENTITY_TAIL would otherwise wave through.
  if (isGenericProviderName(s)) return null;
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
  /** Legal entity when the release used a trade name (see splitDba). */
  legal: string | null;
  at: number;
  how: string;
}

function findProviders(title: string, text: string, issuerName: string | null): ProviderHit[] {
  const hits: ProviderHit[] = [];
  const seen = new Set<string>();
  const issuerKey = issuerName ? issuerName.toLowerCase().slice(0, 10) : null;

  const push = (name: string | null, short: string | null, at: number, how: string, raw = '') => {
    if (!name) return;
    const legal = splitDba(raw.replace(/\s+/g, ' ').trim())?.legal ?? null;
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
    hits.push({ name, short, legal: legal && legal.toLowerCase() !== name.toLowerCase() ? legal : null, at, how });
  };

  ENTITY_WITH_SHORT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTITY_WITH_SHORT.exec(text))) {
    const bracket = m[2];
    // Ticker bracket ⇒ that is the issuer (or a cross-listing), not a provider.
    if (/^(?:TSX|TSXV|CSE|CNSX|NEO|OTC|OTCQB|OTCQX|NASDAQ|NYSE|FSE|FRA|WKN|ISIN)\b/i.test(bracket)) continue;
    // "the Company", "the Agreement", "the Offering" — self-reference, not a firm.
    if (/^(?:the\s+)?(?:company|agreement|issuer|offering|corporation|transaction|plan|board|exchange)$/i.test(bracket)) continue;
    push(cleanProvider(m[1]), bracket.trim(), m.index, 'regex:entity-with-short', m[1]);
  }

  // "The engagement of X as…; The appointment of Y, as…" — one release,
  // several counterparties (Forte Minerals, September 2026). The global
  // patterns run whether or not a short-form introduction was found, since a
  // release can introduce one firm formally and name the next in passing;
  // `seen` keeps a firm found both ways to one hit.
  for (const [re, how] of PROVIDER_PATTERNS) {
    if (!re.global) continue;
    re.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text))) push(cleanProvider(mm[1]), null, mm.index, how, mm[1]);
  }
  if (!hits.length) {
    for (const [re, how] of PROVIDER_PATTERNS) {
      if (re.global) continue;
      const mm = re.exec(text);
      if (mm) push(cleanProvider(mm[1]), null, mm.index, how, mm[1]);
      if (hits.length) break;
    }
  }
  if (!hits.length) {
    const tm = TITLE_PROVIDER.exec(title);
    if (tm) push(cleanProvider(tm[1]), null, 0, 'regex:title', tm[1]);
  }
  return keepIrCounterparties(text, hits).sort((a, b) => a.at - b.at);
}

/**
 * A multi-topic release names counterparties that are not promoters. Elevate
 * Service Group's corporate update carried "the appointment of MNP LLP as
 * auditor" three paragraphs above its investor relations agreement, and the
 * `engagement-of` pattern read the auditor as an IR firm — and, being first
 * on the page, handed it the lead paragraphs and the option grant.
 *
 * Rule: when at least one hit sits in a paragraph that talks about IR-type
 * activity, keep only those hits. When none does — a terse release that
 * introduces the firm in one sentence and says what it is for in the next —
 * keep everything, which is the behaviour every earlier release was parsed
 * under.
 */
function keepIrCounterparties(text: string, hits: ProviderHit[]): ProviderHit[] {
  if (hits.length < 2) return hits;
  const inIrParagraph = (h: ProviderHit) => {
    const start = text.lastIndexOf('\n', h.at) + 1;
    let end = text.indexOf('\n', h.at);
    if (end < 0) end = text.length;
    return ACTIVITY.test(text.slice(start, end));
  };
  const kept = hits.filter(inIrParagraph);
  return kept.length ? kept : hits;
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
  // "the Company agreed to pay a fee of US$250,000 to CGM as compensation"
  // (Elevate Service Group) — a flat fee for the engagement, stated with
  // "pay … fee of" and no "per month". `findFees` refuses this lead when a
  // monthly qualifier follows the amount, so "pay a fee of $5,000 per month"
  // stays a monthly fee and does not double as a total.
  [/\b(?:pay|paid|payable|receive)\s+(?:an?\s+)?(?:one[- ]time\s+|flat\s+|fixed\s+|cash\s+|engagement\s+|total\s+)?(?:fee|compensation|consideration|retainer)\s+of\s+([^.;]{2,45}?)(?=\s+(?:to|as|in|for|upon|on|payable|plus|\()|\s*,(?!\d)|\.(?!\d)|;|$)/i, 'regex:pay-fee-of'],
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
    // An amount carrying a monthly qualifier is a rate, not a total —
    // "pay a fee of $5,000 per month" belongs to the monthly leads above.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (/\b(?:(?:per|a|each)\s+month|\/\s*mo(?:nth)?\b|monthly)/i.test(`${m[1]} ${after.trimStart().slice(0, 12)}`)) continue;
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
  // "the Consultant" stands for the provider only when the release defined it
  // that way. Elevate Service Group granted "100,000 options … to a
  // consultant" — an employee-plan grant in a release whose IR firm was
  // introduced as "CGM" — and the bare word handed those options to CGM.
  const genericRole =
    !provider || /\(\s*(?:the\s+)?["'“]?(?:consultant|ir (?:firm|provider|consultant)|service provider)["'”]?\s*\)/i.test(text);

  let options: number | null = null;
  let strike: number | null = null;
  let shares: number | null = null;
  let how = '';

  for (const s of sentences(text)) {
    const low = s.toLowerCase();
    const namesProvider =
      keys.some((k) => k.length > 3 && low.includes(k)) ||
      (genericRole && /\b(?:the\s+)?(?:consultant|ir (?:firm|provider|consultant)|service provider)\b/i.test(s));
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
  // Some republishers serve the article body lazily, so the name never
  // appears next to the ticker and the release is left nameless on the
  // ranking page. The headline always leads with the company — "IC Group
  // Engages Adelaide Capital…" — so fall back to that.
  if (!issuer.name) issuer.name = issuerFromTitle(title);
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
    // Two shapes arrive here and they need opposite treatment.
    //
    // Pan Global's lazily loaded Investing News Network page: the release body
    // never loaded, and the only ticker on the page was Homeland Nickel's, in
    // the related-articles rail. Filing under it was wrong.
    //
    // IC Group's page, same republisher: chrome in front, but the ticker that
    // follows is IC Group's own, and the release text with Adelaide's fee runs
    // on after it. Throwing that away lost a real contract.
    //
    // What tells them apart is the headline. The issuer names itself in its
    // own headline, and a ticker with that name standing right before it is
    // the issuer's — a rail ticker has some other company's name there. When
    // it anchors, keep the ticker and the providers found in the release text
    // after it; the row still goes to review because the confidence cap holds.
    const headlineIssuer = issuerFromTitle(title);
    const anchored =
      issuer.ticker != null &&
      issuer.at >= 0 &&
      headlineIssuer != null &&
      headlineIssuer.length >= 4 &&
      text.slice(Math.max(0, issuer.at - 200), issuer.at).toLowerCase().includes(headlineIssuer.toLowerCase());
    if (anchored) {
      notes.push(`Ticker ${issuer.ticker} kept: the headline's issuer "${headlineIssuer}" stands before it.`);
      for (const [i, a] of agreements.entries()) {
        const at = hits[i]?.at ?? -1;
        if (at >= issuer.at - 50 && at <= issuer.at + 2500) continue;
        if (a.providerName) notes.push(`Provider "${a.providerName}" discarded: found outside the release text.`);
        a.providerName = null;
        a.providerShort = null;
        a.providerLegalName = null;
      }
    } else {
      // Whatever provider the extractors found came from the navigation or
      // the rail. Drop it so the store writes the needs-review placeholder
      // instead of a public row.
      for (const a of agreements) {
        if (a.providerName) notes.push(`Provider "${a.providerName}" discarded: page body not isolated.`);
        a.providerName = null;
        a.providerShort = null;
        a.providerLegalName = null;
      }
      if (issuer.ticker) notes.push(`Ticker ${issuer.ticker} discarded: page body not isolated.`);
      issuer.ticker = null;
      confidence = Math.min(confidence, 0.3);
    }
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
    providerLegalName: hit?.legal ?? null,
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
  // A dateline is a place, a wire and a date within the first few lines —
  // or, on Investing News Network, a bare date line above the company name.
  if (/^\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*\n+\s*[A-Z]/.test(head)) return true;
  // thenewswire.com's listing shape carries a two-digit year: "June 30'26
  // TheNewswire - Nord Precious Metals Corp (TSXV: NTH)…". No four-digit
  // year anywhere, but it is a dateline all the same.
  if (/^\s*[A-Z][a-z]{2,8}\.?\s+\d{1,2}'\d{2}\s+TheNewswire\s*[-–—]/.test(head)) return true;
  return /[A-Z][A-Za-z .'-]{2,40}\s*[,/—–-]/.test(head) && /\b(19|20)\d{2}\b/.test(text.slice(0, 900));
}

/** Investing News Network's related-articles rail: other companies' releases,
 *  each with its own dateline and ticker, follow the article. Cut before
 *  anything else looks for a dateline, or the rail's first article becomes
 *  the release (Homeland Nickel and Steadright were read this way). */
const RAIL = [/Keep Reading\.{3}/, /The Conversation \(\d+\)/];

export function narrow(body: string): string {
  let t = body.replace(/\r/g, '');
  let rail = t.length;
  for (const re of RAIL) {
    const m = re.exec(t);
    if (m && m.index > 0) rail = Math.min(rail, m.index);
  }
  t = t.slice(0, rail);
  const starts: RegExp[] = [
    // INN's own body header: the network name, a date line, then the release
    // text with no wire dateline of its own.
    /Investing News Network\s*\n\s*(?=[A-Z][a-z]+ \d{1,2}, \d{4}\s*\n)/,
    /[A-Z][A-Za-z .'-]{2,40},\s*[A-Za-z .]{2,30}-{1,2}\(\s*(?:Newsfile Corp\.|GLOBE NEWSWIRE|ACCESS Newswire|ACCESSWIRE|Business Wire|CNW)/,
    /[A-Z][A-Za-z .'-]{2,40},\s*[A-Z]{2}\s*\/\s*(?:ACCESS Newswire|ACCESSWIRE|EINPresswire|Newsfile)\s*\//i,
    /[A-Z][A-Za-z .'-]{2,40}\s*,\s*[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}\s*\/(?:CNW|PRNewswire)/,
    /\/(?:CNW|PRNewswire)[^/]{0,40}\/\s*-/,
    // "(TheNewswire) Vancouver, British Columbia, September 11th, 2026 TheNewswire"
    /\(TheNewswire\)\s+[A-Z][A-Za-z .'-]{2,40},/,
    // thenewswire.com listing shape: "June 30'26 TheNewswire - Nord Precious…"
    /[A-Z][a-z]{2,8}\.?\s+\d{1,2}'\d{2}\s+TheNewswire\s*[-–—]/,
    /[A-Z][A-Za-z .'-]{2,40},\s*[A-Za-z .]{2,30}\s*[-–—]{1,2}\s*\(?[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}\)?\s*[-–—]/,
  ];
  // A wire-anchored dateline (Newsfile, GLOBE NEWSWIRE, /CNW/, INN's header,
  // TheNewswire) beats the generic "Place, Province - Month D, YYYY -" shape,
  // and among equals the earliest wins. Pure first-pattern-wins let a later
  // shape match an earlier position on the page; pure earliest-wins let the
  // generic shape land on a summary paragraph newswire.ca prints above the
  // release (PlantX, January 2021).
  const generic = starts[starts.length - 1];
  let best: RegExpExecArray | null = null;
  let bestTier = 9;
  for (const re of starts) {
    const m = re.exec(t);
    if (!m || m.index >= t.length * 0.92) continue;
    const tier = re === generic ? 1 : 0;
    if (tier < bestTier || (tier === bestTier && (!best || m.index < best.index))) {
      best = m;
      bestTier = tier;
    }
  }
  if (best) {
    const m = best;
    {
      // A wire-led match ("/CNW/ -") sits at the end of its dateline; take
      // the line from its start so the place and the date come along — the
      // isolation check wants a year in the head, and the release's own
      // date belongs with it.
      let from = m.index;
      if (!/^[A-Z]/.test(m[0]) && !m[0].startsWith('Investing News Network')) {
        const lineStart = t.lastIndexOf('\n', m.index) + 1;
        if (m.index - lineStart <= 200) from = lineStart;
      }
      t = t.slice(from + (m[0].startsWith('Investing News Network') ? m[0].length : 0));
      // The place in a dateline is one or two words ("Vancouver,", "New
      // York,"). The character class that finds it also spans spaces, so on
      // an Investing News Network page the match began inside the site
      // navigation — "Us Contact Us Browse Topics Vancouver," — and the head
      // then read as page chrome. Keep the last two words before the comma.
      const comma = t.indexOf(',');
      // Only a place-led match ("…Browse Topics Vancouver, British Columbia")
      // needs this; a wire-led one ("/CNW/ - PlantX Life…") starts exactly
      // where it should and its first comma is somewhere in the body.
      if (comma > 0 && comma < 60 && /^[A-Z]/.test(t)) {
        const words = t.slice(0, comma).trim().split(/\s+/);
        if (words.length > 2 && !/^[A-Z][a-z]+ \d{1,2}$/.test(t.slice(0, comma).trim())) t = words.slice(-2).join(' ') + t.slice(comma);
      }
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
