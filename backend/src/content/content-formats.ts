/**
 * The InsiderBuyer Content Creation format library — a 1:1 encoding of the
 * "Programmatic Content Creation (Topic & Headline) Guide". Every named series
 * (Part 4) and programmatic/SEO template (Part 5), plus Top Stories (Part 3),
 * with its exact headline formula, trigger/cadence, required data, and (where
 * the guide specifies them) prescribed sections. The generator composes a
 * prompt from these specs so each article is produced exactly per the guide.
 */

export type FormatKind = 'top-stories' | 'series' | 'programmatic';

export interface ContentFormat {
  /** Stable slug used in the API. */
  key: string;
  /** Guide reference: "2.1", "#16", "Part 3". */
  ref: string;
  kind: FormatKind;
  /** Display name / eyebrow source. */
  title: string;
  /** Website section the guide files it under. */
  section: string;
  /** Trigger criteria or cadence, verbatim from the guide. */
  trigger: string;
  /** The exact headline formula/template from the guide (with [placeholders]). */
  headlineFormula: string;
  /** Data the guide says this format needs (caller must supply it). */
  requiredData: string[];
  /** Prescribed section flow, where the guide lists one. */
  sections?: string[];
  /** Evergreen | Refreshable | Per-ticker | Per-event, etc. */
  cadenceTag?: string;
  /** Editorial note from the guide (e.g. "facts only"). */
  editorialNote?: string;
  /** Target word count where the guide specifies one. */
  wordCount?: string;
}

// ── Part 3 — Top Stories ──────────────────────────────────────────────────
const TOP_STORIES: ContentFormat[] = [
  {
    key: 'top-stories',
    ref: 'Part 3',
    kind: 'top-stories',
    title: 'Top Stories',
    section: 'TOP STORIES',
    trigger:
      'The event/ticker/person is trending across financial media in the last 24–48 hours, and has insider/congressional relevance.',
    headlineFormula: 'Different spin to what other major outlets are using.',
    requiredData: ['trending event / filings', 'source-article facts to rewrite'],
    editorialNote:
      'Report first, opine second. Facts/filings up top; your read in its own "Our take:" section. Include a bear/skeptic section in every story. No extra subheadings beyond the standard structure + CTA.',
  },
];

// ── Part 4 — Original Content Series (2.1–2.10) ───────────────────────────
const SERIES: ContentFormat[] = [
  {
    key: 'case-study',
    ref: '2.1',
    kind: 'series',
    title: 'Case Studies: When Insider Buys Preceded Monster Rallies',
    section: 'ORIGINAL SERIES',
    trigger: 'A historical insider buy that preceded a huge subsequent move.',
    headlineFormula: 'How a [$X] Insider Buy Sparked a [Y]% Rally in [Company]',
    requiredData: ['historical Form 4', 'price chart', 'timeline of subsequent catalysts'],
    sections: [
      'The buy',
      'What the insider saw',
      'The timeline of the rally',
      'Could you have spotted it?',
      'What to watch for today',
    ],
  },
  {
    key: 'whale-watch',
    ref: '2.2',
    kind: 'series',
    title: 'Whale Watch: The Portfolios of Legendary Insiders',
    section: 'ORIGINAL SERIES',
    trigger: 'Profile a famous investor/insider and break down their top holdings.',
    headlineFormula: '[Name] Is the King/Queen of [Niche] — These Are His/Her Top Holdings',
    requiredData: ['aggregated holdings across 13D/G, Form 4s, fund disclosures'],
  },
  {
    key: 'washington-wealth-files',
    ref: '2.3',
    kind: 'series',
    title: 'The Washington Wealth Files',
    section: 'ORIGINAL SERIES',
    trigger: 'How a politician’s net worth changed after entering office.',
    headlineFormula: "[Their] Net Worth Was [$X] Before Politics. Now It's [$Y].",
    requiredData: ['financial disclosures over time', 'congressional trade history'],
    editorialNote: 'Facts only, sourced to disclosures. Present the numbers; let readers draw conclusions.',
  },
  {
    key: 'beating-buffett',
    ref: '2.4',
    kind: 'series',
    title: "Beating Buffett: Congress's Top Traders",
    section: 'ORIGINAL SERIES',
    trigger: 'Ranked comparison of politicians’ returns vs. a benchmark investor/index.',
    headlineFormula: 'These [N] Politicians Are Outperforming [Benchmark/Famous Investor]',
    requiredData: ['reconstructed returns from disclosed trades', 'benchmark performance'],
    editorialNote: 'Include a methodology box explaining how returns were reconstructed.',
  },
  {
    key: 'billion-dollar-question',
    ref: '2.5',
    kind: 'series',
    title: 'The Billion-Dollar Question',
    section: 'ORIGINAL SERIES',
    trigger: 'A trader/insider who made an extraordinary sum — how, and what their positioning says now.',
    headlineFormula: "This [Trader/Insider] Made [$X] in [Timeframe] — Does He/She Know Something We Don't?",
    requiredData: ['the trade(s) / gain', 'timeframe', 'current positioning'],
  },
  {
    key: 'the-contrarians',
    ref: '2.6',
    kind: 'series',
    title: 'The Contrarians',
    section: 'ORIGINAL SERIES',
    trigger: 'Contrarian trigger — a buy ≥$250K while the stock is ≥50% off its highs.',
    headlineFormula: "Wall Street Gave Up on [Stock]. Its [CFO/Director] Just Bet [$X] It's Wrong.",
    requiredData: ['Form 4 buy ≥$250K', 'stock ≥50% off highs (price context)', 'the buyer'],
  },
  {
    key: 'anatomy-of-a-blowup',
    ref: '2.7',
    kind: 'series',
    title: 'Anatomy of a Blowup',
    section: 'ORIGINAL SERIES',
    trigger: 'Insiders who sold big right before a collapse (cautionary mirror of the case studies).',
    headlineFormula: 'Insiders Dumped [$X] of [Company] Stock. [N] Months Later, It Lost [Y]%.',
    requiredData: ['Form 4 sells', 'timeline', 'subsequent price collapse %'],
  },
  {
    key: 'skin-in-the-game',
    ref: '2.8',
    kind: 'series',
    title: 'Skin in the Game',
    section: 'ORIGINAL SERIES',
    trigger: 'An executive who put a year’s salary (or more) into their own stock.',
    headlineFormula: 'This CEO Earns [$X] a Year. He Just Put [Multiple]x That Into His Own Stock.',
    requiredData: ['executive compensation', 'Form 4 buy size'],
    editorialNote:
      'Compute and feature the "conviction ratio" = buy size ÷ annual compensation — our signature metric.',
  },
  {
    key: 'quiet-whales',
    ref: '2.10',
    kind: 'series',
    title: 'The Quiet Whales',
    section: 'ORIGINAL SERIES',
    trigger: 'Repeated buys by a 10%+ owner with a low media footprint.',
    headlineFormula: "You've Never Heard of [Name]. He's Quietly Built a [$X] Position in [Stock/Sector].",
    requiredData: ['repeated Form 4 buys by a 10%+ owner', 'accumulated position size'],
  },
];

// ── Part 5 — Programmatic & SEO templates (#1–17, 20) ─────────────────────
const PROGRAMMATIC: ContentFormat[] = [
  {
    key: 'fast-growing-high-insider-ownership',
    ref: '#1',
    kind: 'programmatic',
    title: 'Fast-growing stocks with high insider ownership',
    section: 'STOCK IDEAS',
    trigger: 'Weekly screen',
    cadenceTag: 'Refreshable',
    headlineFormula: '3 Fast-Growing Stocks With High Insider Ownership Investors May Want to Watch',
    requiredData: ['screened list: ticker, growth metric, insider ownership %'],
  },
  {
    key: 'buying-or-selling',
    ref: '#2',
    kind: 'programmatic',
    title: 'Are insiders buying or selling [Stock]?',
    section: 'STOCK IDEAS',
    trigger: 'Every trending stock > $500M market cap',
    cadenceTag: 'Per-ticker',
    headlineFormula: 'Are Insiders Buying or Selling [Stock]?',
    requiredData: ['ticker', 'recent Form 4 buys vs sells', 'net insider flow'],
  },
  {
    key: 'who-are-the-insiders',
    ref: '#3',
    kind: 'programmatic',
    title: 'Who are the insiders behind [Stock]?',
    section: 'POPULAR',
    trigger: 'All covered tickers',
    cadenceTag: 'Evergreen',
    headlineFormula: 'Who Are the Insiders Behind [Stock]?',
    requiredData: ['ticker', 'roster of insiders: name, role, ownership, recent activity'],
  },
  {
    key: 'trump-inner-circle',
    ref: '#4',
    kind: 'programmatic',
    title: "Trump's inner circle",
    section: 'POPULAR',
    trigger: 'Event-driven refresh',
    cadenceTag: 'Refreshable',
    headlineFormula: "Meet the Insiders in Trump's Inner Circle",
    requiredData: ['list of figures + their disclosed holdings/trades'],
  },
  {
    key: 'politicians-beating-the-market',
    ref: '#5',
    kind: 'programmatic',
    title: 'Politicians beating the market',
    section: 'POPULAR',
    trigger: 'Quarterly',
    cadenceTag: 'Refreshable',
    headlineFormula: '3 Politicians Who Are Outperforming [the Market / Famous Investor]',
    requiredData: ['politicians + reconstructed returns vs benchmark'],
  },
  {
    key: 'ceo-pay-vs-buying',
    ref: '#6',
    kind: 'programmatic',
    title: 'CEO pay vs. buying',
    section: 'POPULAR',
    trigger: 'Comp filing season + big-pay headlines',
    cadenceTag: 'Per-CEO',
    headlineFormula: 'This CEO Took Home [$X] — Did He Buy Any Shares?',
    requiredData: ['CEO name', 'total compensation', 'open-market buys (if any)'],
  },
  {
    key: 'time-to-buy',
    ref: '#7',
    kind: 'programmatic',
    title: 'Time to buy?',
    section: 'STOCK IDEAS',
    trigger: 'Insider buying accelerating on a ticker',
    cadenceTag: 'Per-ticker',
    headlineFormula: 'Is Now the Time to Start Buying [Stock]?',
    requiredData: ['ticker', 'accelerating buy activity', 'price context'],
  },
  {
    key: 'time-to-sell',
    ref: '#8',
    kind: 'programmatic',
    title: 'Time to sell?',
    section: 'STOCK IDEAS',
    trigger: 'Insider selling accelerating on a ticker',
    cadenceTag: 'Per-ticker',
    headlineFormula: 'Is Now the Time to Start Selling [Stock]?',
    requiredData: ['ticker', 'accelerating sell activity', 'price context'],
  },
  {
    key: 'highest-paid-execs-by-industry',
    ref: '#9',
    kind: 'programmatic',
    title: 'Highest-paid execs by industry',
    section: 'POPULAR',
    trigger: 'Annual, one per industry',
    cadenceTag: 'Evergreen',
    headlineFormula: 'Highest-Paid Executives in the [Industry] Industry',
    requiredData: ['industry', 'ranked execs by total compensation'],
  },
  {
    key: 'top-paid-ceos-per-exchange',
    ref: '#10',
    kind: 'programmatic',
    title: 'Top 10 highest-paid CEOs per exchange',
    section: 'POPULAR',
    trigger: 'Annual',
    cadenceTag: 'Evergreen',
    headlineFormula: 'CEOs Are Pulling In Record Pay: Top 10 Highest-Paid CEOs on [Exchange]',
    requiredData: ['exchange', 'top-10 CEOs by total compensation'],
  },
  {
    key: 'cant-stop-buying',
    ref: '#11',
    kind: 'programmatic',
    title: "Stocks insiders can't stop buying",
    section: 'STOCK IDEAS',
    trigger: 'Weekly screen (repeat-buy filter)',
    cadenceTag: 'Refreshable',
    headlineFormula: "3 Stocks Insiders Can't Stop Buying",
    requiredData: ['tickers with repeated insider buys (count, $ value)'],
  },
  {
    key: 'insider-selling-roundup',
    ref: '#12',
    kind: 'programmatic',
    title: 'Insider selling roundup',
    section: 'STOCK IDEAS',
    trigger: 'Weekly screen',
    cadenceTag: 'Refreshable',
    headlineFormula: 'Insiders Sold These 5 Stocks',
    requiredData: ['5 tickers with notable insider selling ($ value, sellers)'],
  },
  {
    key: 'famous-investor-tracker',
    ref: '#13',
    kind: 'programmatic',
    title: 'Famous investor tracker',
    section: 'STOCK IDEAS',
    trigger: 'New filing by a tracked investor',
    cadenceTag: 'Per-investor',
    headlineFormula: 'What Is [Famous Investor] Buying — and Why?',
    requiredData: ['investor name', 'new filing holdings/changes'],
  },
  {
    key: 'insider-buying-under-5',
    ref: '#14',
    kind: 'programmatic',
    title: 'Insider buying under $5',
    section: 'STOCK IDEAS',
    trigger: 'Weekly screen',
    cadenceTag: 'Refreshable',
    headlineFormula: 'Insider Buying: 5 Stocks Under $5',
    requiredData: ['5 sub-$5 stocks with insider buys (price, buy $)'],
  },
  {
    key: 'insider-buying-under-1',
    ref: '#15',
    kind: 'programmatic',
    title: 'Insider buying under $1',
    section: 'STOCK IDEAS',
    trigger: 'Weekly screen',
    cadenceTag: 'Refreshable',
    headlineFormula: 'Insider Buying: 3 Stocks Under $1',
    requiredData: ['3 sub-$1 stocks with insider buys (price, buy $)'],
  },
  {
    key: 'radar-big-buys',
    ref: '#16',
    kind: 'programmatic',
    title: 'Radar: big buys',
    section: 'STOCK IDEAS',
    trigger: 'Size trigger (2 qualifying buys)',
    cadenceTag: 'Refreshable',
    headlineFormula: 'Big Insider Buying Puts These 2 Stocks on the Radar',
    requiredData: ['2 tickers with qualifying large buys ($ value, buyer, role)'],
  },
  {
    key: 'most-undervalued-per-exchange',
    ref: '#17',
    kind: 'programmatic',
    title: 'Most undervalued stocks per exchange',
    section: 'STOCK IDEAS',
    trigger: 'Monthly, one per exchange',
    cadenceTag: 'Evergreen',
    headlineFormula: '10 Most Undervalued [Exchange] Stocks to Buy Right Now (According to Analyst Ratings)',
    requiredData: ['exchange', '10 stocks ranked by analyst-rating upside/valuation'],
  },
  {
    key: 'conviction-bet',
    ref: '#20',
    kind: 'programmatic',
    title: 'The Conviction Bet',
    section: 'STOCK IDEAS',
    trigger: "Single buy ≥$500K or ≥1x the exec's annual salary",
    cadenceTag: 'Per-event',
    headlineFormula: 'This CEO or CFO Just Made a [$X] Bet on [Stock]',
    requiredData: ['the buy ($ value, shares, price)', 'the person', 'their track record on this stock'],
    sections: ['The trade', 'Who this person is', 'Their track record on this stock', 'What it means'],
    wordCount: '600–800 words',
  },
];

export const CONTENT_FORMATS: ContentFormat[] = [
  ...TOP_STORIES,
  ...SERIES,
  ...PROGRAMMATIC,
];

export function findFormat(key: string): ContentFormat | undefined {
  return CONTENT_FORMATS.find((f) => f.key === key);
}
