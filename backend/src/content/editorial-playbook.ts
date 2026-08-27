/**
 * Editorial Operations Manual v2 — codified.
 *
 * A 1:1 encoding of "InsiderBuying_Editorial_Playbook_v2.docx" (client, Aug
 * 2026), the same way `content-formats.ts` encodes the programmatic content
 * guide. This file is the single source of truth that three consumers read:
 *
 *   • `editorial-checklist.ts` — the Section 10 pre-publish gate;
 *   • `story-desk.service.ts`  — the Section 2 story-pitch prompt;
 *   • `GET /content/editorial-playbook` — what the content team reads in the
 *     Editorial Desk UI, so the rules the writer sees and the rules the
 *     publisher enforces cannot drift apart.
 *
 * SCOPE: the EDITORIAL section only (`kind: 'editorial'` — the hand-written
 * Top Stories). Programmatic articles keep their own format library; nothing
 * here applies to them.
 *
 * ── Two places the manual is deliberately NOT followed literally ──
 *
 * 1. THE IQS NUMBER. The manual asks for the IQS score "referenced in article
 *    text and/or shown in viz" (Sections 7, 10). The numeric score is a
 *    premium product surface everywhere else on the site, and both publish
 *    paths already strip it out of prose (`SCORE_LEAK` in content.service, and
 *    `sanitizeArticleHtml` masks stored bodies at render). So the rule here is:
 *    prose carries the qualitative BAND ("a top-tier Insider Score"), and the
 *    NUMBER appears only inside a viz embed, where the site's existing paygate
 *    component shows it to subscribers and a `Pro` pill to everyone else. The
 *    manual's intent — every article reminds the reader we have data they
 *    cannot get elsewhere — is met without giving the paywalled number away.
 *
 * 2. ROUTES. The manual writes `/stocks/[TICKER]` and `/articles/[slug]`.
 *    Neither is this site's route: stock pages are `/companies/[TICKER]` and
 *    editorials are `/insights/[slug]`. The checklist therefore requires the
 *    REAL routes, and `/articles/[slug]` exists as a redirect so a URL written
 *    per the manual still resolves.
 */

/** Section 9 — the five approved category tags. Exactly one per article. */
export const EDITORIAL_CATEGORIES = [
  'INSIDER ALERT',
  'MARKET MOVER',
  'BREAKING',
  'EARNINGS WATCH',
  'SECTOR SPOTLIGHT',
] as const;
export type EditorialCategory = (typeof EDITORIAL_CATEGORIES)[number];

/** Section 5 — hero stories run longer than small-slot ones. The gate uses the
 *  outer band (WORD_COUNT_MIN/MAX); these are the manual's per-slot targets,
 *  reported so a writer knows which half of the band they are aiming at. */
export const WORD_COUNT_HERO = { min: 350, max: 600 } as const;
export const WORD_COUNT_SMALL = { min: 250, max: 400 } as const;

/** Section 5 — the article arc. Order is the publish order. */
export const ARTICLE_ARC = [
  { section: 'Lede', length: '2–3 sentences', purpose: 'The most important fact first. Specific number or event. Company name and ticker in sentence 1.' },
  { section: 'Context', length: '3–4 sentences', purpose: 'Why does this matter? Background for a reader who may not know this company.' },
  { section: 'The Insider Angle', length: '3–5 sentences', purpose: 'What does Form 4 data show? MANDATORY in every article. Reference the Insider Score band where relevant.' },
  { section: 'Market Reaction', length: '2–3 sentences', purpose: 'What is the broader financial world saying? Paraphrase — never copy.' },
  { section: 'Data Visualization', length: 'embedded', purpose: 'Chart, table or callout in the BODY, after context and before What to Watch.' },
  { section: 'What to Watch', length: '2–3 sentences', purpose: 'Forward-looking. What would confirm or change this story?' },
  { section: 'CTA', length: '1 sentence', purpose: 'Link to the relevant company page or screener.' },
  { section: 'Disclaimer', length: '2 sentences', purpose: 'Standard disclosure, verbatim.' },
] as const;

/** Section 4 — the six voice principles, as the team reads them. */
export const VOICE_PRINCIPLES = [
  { principle: 'Specific, never vague', practice: 'Every claim has a number. Every number has a source.' },
  { principle: 'Neutral, never promotional', practice: 'Present the data; let the reader conclude. Prove significance with history, never assert it.' },
  { principle: 'Confident, never hedging', practice: '"The data suggests" is fine. Stacked qualifiers are not.' },
  { principle: 'Honest about the limits', practice: 'If the insider data shows nothing, say so. The absence is often the story.' },
  { principle: 'One distinct angle', practice: 'Not "here is what happened" but "here is what the insider data reveals about it".' },
  { principle: 'Short paragraphs, always', practice: 'Maximum 4 sentences. Most 2–3.' },
] as const;

/** Section 5 — words the manual bans from body copy ("editorial empty
 *  calories"). Matched as whole words, case-insensitively. */
export const BANNED_BODY_WORDS = [
  'game-changing',
  'game changing',
  'landmark',
  'revolutionary',
  'exciting',
  'incredible',
  'massive',
  'huge',
] as const;

/** Section 6 — headline alarm bells. Never allowed in a headline. */
export const BANNED_HEADLINE_WORDS = [
  "you won't believe",
  'you wont believe',
  'shocking',
  'mind-blowing',
  'mind blowing',
  'stunning',
  'incredible',
] as const;

/** Section 4 — the advice voice. We have a "here is what the data shows"
 *  voice, not a buy/sell one, and these phrasings cross that line. */
export const PROMOTIONAL_PHRASES = [
  'great opportunity',
  'investors should',
  'you should buy',
  'we recommend',
  'a must-buy',
  'must own',
  'do not miss',
  "don't miss",
  'act now',
  'before it is too late',
  "before it's too late",
] as const;

/** Section 6 — headline limits. */
export const HEADLINE_MAX_WORDS = 12;
/** Section 10 — SEO field limits. */
export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 155;
/**
 * Section 5 — word count band. "Hero stories 350–600 words. Small slot stories
 * 250–400 words. Never shorter than 250. Never longer than 600 for web
 * editorial."
 *
 * "Never" is the manual's word, so both ends are hard: outside 250–600 blocks
 * the publish rather than warning. Note the live articles predating this
 * manual run to roughly 1,000 words; they are unaffected (the gate applies at
 * publish), but nothing new gets through above 600.
 */
export const WORD_COUNT_MIN = 250;
export const WORD_COUNT_MAX = 600;
/** Section 4 — paragraph ceiling. */
export const MAX_SENTENCES_PER_PARAGRAPH = 4;

/** Section 7 — the six approved viz types. `embed` is the literal placeholder
 *  the writer puts in the body; ArticleBody swaps it for a live component. */
export const VIZ_TYPES = [
  {
    key: 'insider-timeline',
    title: 'Insider Transaction Timeline',
    whenToUse: "Any article about a specific company's insider buying activity.",
    embed: '<div data-viz="insider-timeline" data-ticker="TICKER"></div>',
    note: 'Renders the absence too — a company with no open-market purchases in the window shows an explicit "no open-market purchases" state, which is what makes the Moderna-style story visible.',
  },
  {
    key: 'iqs-card',
    title: 'Insider Score Card',
    whenToUse: 'Any article where the Insider Score is part of the story.',
    embed: '<div data-viz="iqs-card" data-ticker="TICKER"></div>',
    note: 'The number is behind the site paygate (subscribers see it, everyone else sees a Pro pill). The band and the last-purchase date are always visible.',
  },
  {
    key: 'sector-table',
    title: 'Sector Comparison Table',
    whenToUse: 'Macro or sector-level stories about where insider conviction is concentrated.',
    embed: '<div data-viz="sector-table" data-days="30"></div>',
    note: 'Columns: Sector | Avg Insider Score | Cluster buys (window) | YoY change. Live from /metrics/sector-conviction. The YoY column appears only when the year-ago window has enough coverage to be meaningful — our Form 4 record starts Aug/Sep 2025, so a figure drawn from before that measures our ingest, not insider behaviour.',
  },
  {
    key: 'price-markers',
    title: 'Stock Price vs. Insider Buy Markers',
    whenToUse: '"Was this purchase a signal?" and "before the move" stories.',
    embed: '<div data-viz="price-markers" data-ticker="TICKER"></div>',
    note: 'One year of price with a marker per open-market purchase, so timing relative to price is visible.',
  },
  {
    key: 'tx-compare',
    title: 'Transaction Comparison Row',
    whenToUse: 'Cluster buy stories and sector roundups — comparing several purchases.',
    embed: '<div data-viz="tx-compare" data-ticker="TICKER"></div>',
    note: 'A stat row: insider, role, amount, date — one column per buyer in the cluster.',
  },
  {
    key: 'pull-quote',
    title: 'Data Pull-Quote Box',
    whenToUse: 'When one number is striking enough to deserve emphasis.',
    embed: '<div data-viz="pull-quote">Your one striking stat, as text.</div>',
    note: 'Navy background, gold text, brand-styled. The only viz whose content the writer supplies directly.',
  },
] as const;
export type VizKey = (typeof VIZ_TYPES)[number]['key'];
export const VIZ_KEYS: readonly string[] = VIZ_TYPES.map((v) => v.key);

/** Section 5 — outlets the manual names for the Market Reaction paragraph
 *  ("paraphrase and credit the outlet"), plus the wires this site already
 *  reads. Used only to check that SOMETHING is credited. */
export const CREDITABLE_OUTLETS = [
  'wall street journal',
  'wsj',
  'cnbc',
  "barron's",
  'barrons',
  'bloomberg',
  'reuters',
  'financial times',
  'the logic',
  'politico',
  'bbc',
  'cbc',
  'associated press',
  'forbes',
  'the globe and mail',
  'benzinga',
  'marketwatch',
  'seeking alpha',
  // §5 names WSJ / CNBC / Barron's as examples of crediting an outlet, not as
  // the permitted set. A Yukon exploration story is covered by the mining
  // trades and barely by the general financial press, so requiring one of the
  // three would push a writer to cite a paper that never wrote about it.
  'mining.com',
  'north of 60',
  'northern miner',
  'streetwise reports',
  'junior mining network',
  'investing news network',
  'crux investor',
  'kitco',
  'stockhouse',
] as const;

/**
 * Section 5 — the attribution the manual requires. The phrase that must appear
 * is "reviewed by InsiderBuying.com"; what precedes it depends on the filing
 * regime, and the manual is explicit that there are two.
 *
 * §3 lists SEDI as a daily source "for TSX/TSXV coverage". The §9 disclaimer is
 * to be reproduced verbatim and reads "sourced from publicly available SEC Form
 * 4 filings via EDGAR **and/or SEDI (Canada)**". And the manual's own Example 2
 * attributes straight to it: "SEDI filings — Canada's equivalent of the SEC's
 * Form 4 — reviewed by InsiderBuying.com".
 *
 * So a Canadian-filer article satisfies the insider-angle requirement by citing
 * SEDI, exactly as a US-filer article does by citing Form 4. An earlier version
 * of this checklist accepted only the Form 4 wording, which was narrower than
 * the manual and failed every TSXV subject on a rule the manual does not have.
 */
export const ATTRIBUTION_PHRASE = 'reviewed by InsiderBuying.com';
/** Filing regimes the manual recognises, in the wording it uses for each. */
export const FILING_REGIMES = [
  { key: 'form4', label: 'SEC Form 4 (EDGAR)', match: /form\s*4/i, coverage: 'ingested' },
  { key: 'sedi', label: 'SEDI (Canada)', match: /\bsedi\b/i, coverage: 'not ingested' },
] as const;
/** Kept for callers that predate the two-regime rule. */
export const FORM4_ATTRIBUTION = ATTRIBUTION_PHRASE;

/** Section 9 — the disclaimer, verbatim. Rendered by the article page's
 *  compliance footer, so a body copy of it is a duplicate, not a requirement:
 *  the checklist asserts the footer will supply it rather than asking the
 *  writer to paste it. Kept here because it is the canonical text. */
export const DISCLAIMER = [
  'This article is for informational purposes only and does not constitute investment advice.',
  'All insider transaction data is sourced from publicly available SEC Form 4 filings via EDGAR and/or SEDI (Canada).',
  'InsiderBuying.com does not recommend buying or selling any security.',
  'Always conduct your own due diligence before making investment decisions.',
].join(' ');

/** Section 9 — the CTA. One per article, every article. */
export function ctaSentence(company: string, ticker: string): string {
  const t = ticker.toUpperCase();
  return `Track real-time insider activity at ${company} (${t}) and 9,000+ companies → <a href="/companies/${t}">insiderbuying.com/companies/${t}</a>`;
}

/** Section 10 — the slug shape, adapted to this site's live route.
 *  Manual: `/articles/[ticker]-[3-word-desc]-[YYYY-MM-DD]`.
 *  Here: the same shape, `editorial-` prefixed, served at /insights/[slug]. */
export const SLUG_PATTERN =
  /^editorial-[a-z0-9]+(?:-[a-z0-9]+)*-\d{4}-\d{2}-\d{2}$/;

/** Section 8 — the five homepage slots and how they turn over. The rotation is
 *  automatic on this site: Top Stories reads the newest `editorial` posts in
 *  publish order, so a new article IS slot 1 and everything steps down by
 *  itself. Slots 4–5 fall back to evergreen editorial on a thin news week. */
export const SLOTS = [
  { slot: 1, position: 'HERO — full width, top', role: 'Newest article.', refresh: 'On publish' },
  { slot: 2, position: 'Small — top row', role: "Previous hero.", refresh: 'Automatic step-down' },
  { slot: 3, position: 'Small — top row', role: '48-hour-old hero.', refresh: 'Automatic step-down' },
  { slot: 4, position: 'Small — bottom row', role: 'Context or evergreen piece.', refresh: 'Automatic step-down' },
  { slot: 5, position: 'Small — bottom row', role: 'Oldest featured story.', refresh: 'Steps down to /insights archive' },
] as const;

/** Section 8 — evergreen story types for slots 4–5 on a slow news day. */
export const EVERGREEN_TYPES = [
  'Sector roundup: "Where Are Insiders Buying in [Sector] Right Now?"',
  'Insider Score explainer: "What the Insider Score Actually Measures"',
  'Historical case study: "[Company]: The Insider Signal That Preceded a 40% Move"',
  'Weekly data summary: "The 5 Biggest Insider Purchases of the Past Week"',
  'Congressional trades: "What Your Elected Officials Are Buying Right Now"',
] as const;

/**
 * Section 4 — "We are not a promoter. Articles about companies that pay us for
 * IR services must be clearly labeled as sponsored — they never appear in the
 * organic Top Stories rotation."
 *
 * Both halves are mechanical, so both are enforced rather than trusted: a
 * sponsored article renders a SPONSORED label, and `dealHomeFeed` excludes it
 * from the Top Stories block. The flag is `blog_posts.sponsored`.
 */
export const SPONSORED_LABEL = 'SPONSORED';
export const SPONSORED_RULE =
  'Paid/IR content carries a SPONSORED label and is excluded from the organic Top Stories rotation. It remains reachable at its own URL and in the archive.';

/** Section 3 — the daily source watchlist, so the Editorial Desk can render it
 *  as a checklist instead of the team keeping the docx open. */
export const SOURCE_WATCHLIST = [
  { source: 'InsiderBuying /trades', look: 'Top Insider Score bands filed today. Cluster flags. CEO/CFO buys.', url: '/trades', cadence: 'Daily' },
  { source: 'SEC EDGAR — Form 4', look: 'Open-market purchases, last 24h, over $100K.', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4', cadence: 'Daily' },
  { source: 'Wall Street Journal', look: 'Market headlines, company news, macro with market impact.', url: 'https://www.wsj.com', cadence: 'Daily' },
  { source: 'CNBC Business', look: 'Breaking market news, analyst calls, pre-market movers.', url: 'https://www.cnbc.com/business', cadence: 'Daily' },
  { source: "Barron's", look: 'Deep analysis, sector analysis, fund moves.', url: 'https://www.barrons.com', cadence: 'Daily' },
  { source: 'The Logic', look: 'Canadian capital markets, Bay Street, policy affecting markets.', url: 'https://thelogic.co', cadence: 'Daily (Canadian angle)' },
  { source: 'Yahoo Finance — Gainers', look: 'Stocks up 5%+ today. Cross-reference with EDGAR.', url: 'https://finance.yahoo.com/markets/stocks/gainers', cadence: 'Daily' },
  { source: 'Stocktwits / X cashtags', look: 'Retail sentiment spikes.', url: 'https://stocktwits.com', cadence: 'Daily' },
  { source: "Google Alert — 'insider buying'", look: 'What other outlets are writing about insider transactions.', url: 'https://alerts.google.com', cadence: 'Real-time email' },
  { source: 'InsiderBuying /earnings', look: 'Earnings in next 5 days. Pre-earnings insider activity.', url: '/earnings', cadence: 'Every Monday' },
  { source: 'SEDI (Canada)', look: 'Canadian insider filings.', url: 'https://www.sedi.ca', cadence: 'Daily (TSX coverage) — NOTE: not ingested by this platform, manual only.' },
] as const;

/** Section 6 — the two headline formats, with the manual's own examples. */
export const HEADLINE_FORMATS = [
  {
    format: 'Bold Statement',
    rule: 'States a specific, surprising or counter-intuitive fact. The reader learns something from the headline alone.',
    weak: 'Moderna Stock Has Big Day After Trial Results',
    strong: 'Moderna Doubled in a Day. The Insider Data Tells a More Complicated Story.',
  },
  {
    format: 'Pointed Question',
    rule: "A question the reader genuinely wants answered — and the first paragraph answers it. Never a yes/no question; use how, why or what.",
    weak: 'Was Insider Buying a Signal for This Stock?',
    strong: "The CEO of This $800M Company Has Bought Stock Six Times This Year. Is He Seeing Something the Market Isn't?",
  },
] as const;

/** The manual's whole-document summary, for the Editorial Desk header. */
export const PLAYBOOK_META = {
  version: '2.0',
  updated: 'August 2026',
  refreshCycle: 'Every 48 hours',
  standard:
    'Every article should feel like it was written by a financially literate journalist who reads the WSJ every morning, tracks EDGAR every afternoon, and has a genuine point of view. Editorial model: The Logic — deeply reported, specific, neutral in tone, punchy in structure.',
  threeQuestions: [
    'Does the headline make a specific, bold claim or pose a genuinely interesting question?',
    'Does the first paragraph deliver exactly what the headline promised?',
    'Is there an insider data element — Form 4 activity, Insider Score, transaction history — embedded in the story?',
  ],
} as const;
