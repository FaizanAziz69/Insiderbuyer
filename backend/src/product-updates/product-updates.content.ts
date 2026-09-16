/**
 * Product Updates list — the copy.
 *
 * George (2026-09-16): "a dedicated email list and email flows for Product
 * updates … each email every few days should be about a new feature /
 * capability … short, not too long. No hyperbole and not too over
 * promotional. Not sales language. Just direct, simple language around what
 * it is, what it does, why it could be valuable for you and how to use it.
 * With simple product screenshots of each and a link that brings you
 * directly to the page."
 *
 * So every feature email has the same four parts in the same order — what it
 * is, why it could be useful, how to use it, a screenshot and one link — and
 * nothing else. Facts here are taken from the pages' own copy; when a page
 * changes what it does, change the matching entry here.
 *
 * Screenshots live in frontend/public/sales/product-updates/ and are served
 * straight from disk by nginx with a 30-day cache, so a replaced image ships
 * under a NEW filename (the date suffix).
 */

export interface FeatureEmail {
  /** Stable id used for send-dedupe; never renumber a shipped one. */
  id: string;
  /** Position in the drip — email N goes out N × DRIP_INTERVAL_DAYS after signup. */
  order: number;
  name: string;
  subject: string;
  preview: string;
  /** Site path the button opens. */
  path: string;
  cta: string;
  /** Optional second link, e.g. the table view of a visualizer. */
  also?: { label: string; path: string };
  /** Screenshot path under the site root. */
  image: string;
  imageAlt: string;
  /** What it is and what it does. Plain sentences; may contain <a>. */
  what: string;
  /** Why it could be valuable to the reader. */
  why: string;
  /** How to use it — short numbered steps. */
  how: string[];
  /** A plain factual caveat, when one is needed. */
  note?: string;
}

/** Days between feature emails ("every few days"). */
export const DRIP_INTERVAL_DAYS = 3;

const IMG = '/sales/product-updates';

export const FEATURES: FeatureEmail[] = [
  {
    id: 'f01-insider-score',
    order: 1,
    name: 'Insider Score',
    subject: 'Insider Score: how we rank insider buying',
    preview: 'A 0–99 measure of how strong and meaningful a company’s insider buying is.',
    path: '/insiders/hot',
    cta: 'Open Top Insider Scores',
    also: { label: 'See the full calculation for any ticker', path: '/score-explainer' },
    image: `${IMG}/insider-score-2026-09.jpg`,
    imageAlt: 'Top Insider Scores table',
    what:
      'The Insider Score is a 0–99 measure of how strong and meaningful a company’s insider buying is. Every open-market purchase by an officer or director is scored on its size and the growth in the buyer’s stake, the buyer’s track record and seniority, whether the purchase was opportunistic or routine, whether they bought into a falling price, and the company’s valuation, size and insider ownership. Scores decay over 90 days, rise when several insiders buy together, and are ranked against the whole market. Share issuance and confirmed litigation are deducted.',
    why:
      'A single Form 4 tells you that an insider bought. The score tells you how much that purchase matters compared with every other insider purchase in the market right now, so you can spend your time on the few that stand out.',
    how: [
      'Open Top Insider Scores. The list is ranked by score. The first six names are free to view; Insider Access shows the full list down to #1.',
      'Click any stock to open its page. The banner at the top shows its current Insider Score.',
      'To see the whole calculation for any ticker, use the Score Explainer: every transaction counted or excluded, every input with its source, and every formula.',
    ],
  },
  {
    id: 'f02-analyst-rankings',
    order: 2,
    name: 'Analyst Rankings',
    subject: 'Analyst Rankings: which analysts have actually been right',
    preview: 'Wall Street analysts ranked by the measured success of their price targets.',
    path: '/analyst-ratings',
    cta: 'Open Top Wall Street Analysts',
    also: { label: 'Top Analyst Stocks', path: '/analyst-stocks' },
    image: `${IMG}/analyst-rankings-2026-09.jpg`,
    imageAlt: 'Top Wall Street Analysts table',
    what:
      'Top Wall Street Analysts ranks individual analysts by measured performance: the success rate and average return of their price-target calls, scored from the price on the day each note was posted against the year that followed. An analyst gets a rate once they have enough calls at least 30 days old; until then the row says Pending rather than guessing. The companion page, Top Analyst Stocks, lists up to 50 stocks that several analysts with a strong measured record currently cover, ranked by how many cover it, how accurate they have been, and the upside to their average target.',
    why:
      'Price targets are quoted everywhere without any record attached. Knowing whether the analyst behind a target has been right 40% of the time or 80% of the time changes how much weight it deserves.',
    how: [
      'Open Top Wall Street Analysts and sort by success rate or average return.',
      'Search for an analyst who covers a stock you hold to see their record before you weigh their target.',
      'Use Top Analyst Stocks to see where the most accurate analysts currently agree. Ranks past the first few are part of Insider Access.',
    ],
  },
  {
    id: 'f03-insider-bubbles',
    order: 3,
    name: 'Insider Bubbles',
    subject: 'Insider Bubbles: a live map of large insider purchases',
    preview: 'Every bubble is one insider purchase of $250,000 or more.',
    path: '/bubbles',
    cta: 'Open Insider Bubbles',
    image: `${IMG}/bubbles-2026-09.jpg`,
    imageAlt: 'Insider Bubbles map',
    what:
      'Insider Bubbles is a live map of insider buying. Every bubble is one insider purchase of $250,000 or more. Bubbles are sized by the dollars bought and coloured by whether the stock still trades below what the insider paid. A ×N badge marks a cluster buy, where several insiders at the same company bought together.',
    why:
      'It shows in one screen where executive conviction is concentrating right now, and which of those stocks still trade at or below the insider’s price.',
    how: [
      'Open Insider Bubbles and pick a time window. Same-day and weekly windows are part of Insider Access; the longer windows are free.',
      'Look for the largest bubbles and any with a cluster badge.',
      'Click a bubble to open the stock’s scores board, with the purchase details and the Form 4.',
    ],
  },
  {
    id: 'f04-government-contracts',
    order: 4,
    name: 'Government Contracts',
    subject: 'Government Contracts: who won federal money, and who bought their own stock after',
    preview: 'Federal awards by company, next to the insider buying that followed.',
    path: '/visualizers/government-contracts',
    cta: 'Open the Government Contracts visualizer',
    also: { label: 'Government Contracts as a table', path: '/government-contracts' },
    image: `${IMG}/gov-contracts-2026-09.jpg`,
    imageAlt: 'Government Contracts visualizer',
    what:
      'The Government Contracts visualizer maps federal contract awards to public companies. Every bubble is one company, sized by the federal dollars it was awarded in the window you choose. You can switch between the United States (USAspending) and Canada, and for each company see whether insiders were buying their own stock after the award. The Government Contracts stock list shows the same data as a table.',
    why:
      'Contract awards are public but scattered across agency records. Seeing them by company, next to the insider buying that followed, puts two public signals about the same stock side by side.',
    how: [
      'Open the visualizer and choose the country and the time window.',
      'Hover a bubble for the award details; click to open the company with its contracts and insider trades.',
      'Prefer a table? Use the Government Contracts list.',
    ],
  },
  {
    id: 'f05-promoter-score',
    order: 5,
    name: 'Promoter Score',
    subject: 'Promoter Score: what Canadian venture issuers pay to be promoted',
    preview: 'Disclosed IR spend per issuer, and what the stock did next.',
    path: '/promoter-score',
    cta: 'Open Promoter Score',
    image: `${IMG}/promoter-score-2026-09.jpg`,
    imageAlt: 'Promoter Score ranking',
    what:
      'Companies listed on the TSX Venture Exchange and the CSE must disclose every investor-relations, promotional and market-making agreement by news release: the firm hired, the fee, the term and any options granted. Promoter Score reads those releases and totals the spend for each issuer by quarter. The score is a 0–100 percentile against sector peers. Beside it you see the disclosed spend, spend relative to market cap, the date the promotion began, what the share price did after the first contract, the dollar value traded since then and how that compares with the fees paid, and the volume that came through German exchanges.',
    why:
      'Paying for investor relations is legal, disclosed and common. Knowing that a company is paying to be promoted, how much, and what followed is context most investors never see, because almost nobody reads those releases.',
    how: [
      'Open Promoter Score and sort by score, spend, stock performance, or traded ÷ IR spend.',
      'Click an issuer to see each contract with its provider, fee, start date and the source release.',
      'We take no view on whether promotion is a good or bad sign. The page shows what was disclosed and what happened next.',
    ],
  },
  {
    id: 'f06-top-ir-promoters',
    order: 6,
    name: 'Top IR Promoters',
    subject: 'Top IR Promoters: the promotion firms, ranked by client results',
    preview: 'IR firms measured by what their clients’ shares did after each engagement.',
    path: '/top-ir-promoters',
    cta: 'Open Top IR Promoters',
    image: `${IMG}/top-ir-promoters-2026-09.jpg`,
    imageAlt: 'Top IR Promoters ranking',
    what:
      'Top IR Promoters ranks the investor-relations and promotional firms that Canadian venture issuers hire, using the same disclosures behind Promoter Score. Each firm is measured by what its clients’ shares did after the engagement began: the median return and the median growth in daily trading volume. Promoter Performance is a 0–100 standing on that list. The number of campaigns behind each figure is shown in every row, because most firms have only a few.',
    why:
      'If you hold or follow a venture stock that hires a promoter, this shows the record of that firm’s other engagements.',
    how: [
      'Open Top IR Promoters. The metrics are visible for every firm; firm names and client tickers are part of Insider Access.',
      'Check the campaign count before reading much into a single median.',
      'Click through to the client issuers on Promoter Score.',
    ],
  },
  {
    id: 'f07-ipo-calendar',
    order: 7,
    name: 'IPO Calendar',
    subject: 'IPO Calendar: every listing from the last 90 days, marked to market',
    preview: 'Offering price, latest close, return since listing, and a flag when insiders have bought.',
    path: '/ipos',
    cta: 'Open the IPO Calendar',
    image: `${IMG}/ipo-calendar-2026-09.jpg`,
    imageAlt: 'IPO Calendar table',
    what:
      'The IPO Calendar lists every company that began trading in the trailing 90 days, with its offering price, the latest close and the return since listing, updated nightly. A badge flags companies where an insider has already bought stock on the open market since the debut, with a link to the Form 4.',
    why:
      'Insider buying shortly after an IPO is unusual, because insiders are usually locked up or selling. The badge surfaces the exceptions without you checking each filing.',
    how: [
      'Open the IPO Calendar and sort by return since listing or by listing date.',
      'Look for the insider-buy badge and open the Form 4 behind it.',
      'Click any company for its stock page and Insider Score.',
    ],
  },
  {
    id: 'f08-top-congress-trades',
    order: 8,
    name: 'Top Congress Trades',
    subject: 'Top Congress Trades: a trade, a committee, and a contract',
    preview: 'Where a member’s stock trade, their committee and a federal award meet.',
    path: '/top-congress-trades',
    cta: 'Open Top Congress Trades',
    also: { label: 'Every disclosed trade: the Politician Stock Tracker', path: '/congressional-trades' },
    image: `${IMG}/top-congress-trades-2026-09.jpg`,
    imageAlt: 'Top Ranking Congress Trades table',
    what:
      'Top Ranking Congress Trades is where three public records meet: a member of Congress’s disclosed stock trade, the committee that member sits on which oversees a federal agency, and a contract that agency awarded to the company traded. Every row links to all three documents, and rows are ranked by a Congress Trade Score explained on the page.',
    why:
      'Each of these records is public on its own. Putting them together for the same company and the same member is what makes them worth a look.',
    how: [
      'Open Top Congress Trades. Use the agency dropdown to filter.',
      'Open the three linked documents on any row to check the record yourself.',
      'For every disclosed trade by every member, use the Politician Stock Tracker.',
    ],
    note: 'The list is short while our history of federal awards is still being loaded, and grows as more awards come in.',
  },
  {
    id: 'f09-prediction-markets',
    order: 9,
    name: 'Prediction Markets',
    subject: 'Prediction Markets: live event odds, drawn as bubbles',
    preview: 'Each bubble is one event contract, sized by dollars traded.',
    path: '/visualizers/prediction-markets',
    cta: 'Open Prediction Markets',
    image: `${IMG}/prediction-markets-2026-09.jpg`,
    imageAlt: 'Prediction Markets visualizer',
    what:
      'The Prediction Markets visualizer shows live prediction-market contracts as bubbles. Each bubble is one event contract, sized by the dollars traded on it and coloured by which way the money leans. Prices update live and cover politics, the Federal Reserve, crypto, sports and tech.',
    why:
      'Prediction markets are a fast read on what people with money at stake expect to happen. Seeing the whole market in one view shows where volume is concentrating and where the odds are moving.',
    how: [
      'Open Prediction Markets. Bubbles resize as trading happens.',
      'Hover a bubble for the current price and volume; click for the contract details.',
      'Use the category filters to focus on the events you follow.',
    ],
  },
  {
    id: 'f10-top-insiders',
    order: 10,
    name: 'Top Insiders',
    subject: 'Top Insiders: the people doing the buying, with their track record',
    preview: 'Officers, directors and large holders ranked by recent purchases, with accuracy.',
    path: '/insiders',
    cta: 'Open Top Insiders',
    image: `${IMG}/top-insiders-2026-09.jpg`,
    imageAlt: 'Top Insiders table',
    what:
      'Top Insiders ranks the individual officers, directors and large holders who have bought the most stock recently, by total purchase value, and shows each insider’s live track-record accuracy: how their past purchases worked out. Each name opens an insider page with their trade history, the companies involved, and a short profile where we could identify them.',
    why:
      'Some insiders have a record of buying well. Knowing who is buying, and how their previous buys performed, adds a layer a ticker list cannot.',
    how: [
      'Open Top Insiders and use the filter bar to narrow by group.',
      'Click a name for their page: trades, companies and track record.',
      'From an insider page, open any company to see the Insider Score behind the purchase.',
    ],
  },
  {
    id: 'f11-goldminer',
    order: 11,
    name: 'Goldminer AI',
    subject: 'Goldminer AI: every major gold project, sized by its economics',
    preview: 'Gold projects on the map, sized by study value, each figure dated.',
    path: '/visualizers/goldminer',
    cta: 'Open Goldminer AI',
    image: `${IMG}/goldminer-2026-09.jpg`,
    imageAlt: 'Goldminer AI map',
    what:
      'Goldminer AI maps every major gold project on Earth, anchored to where it actually is and sized by what its published economic study says it is worth. Each figure carries the study it came from (NI 43-101 or S-K 1300) and the date. You can compare a project against the medians of its peers and import your own list as a CSV.',
    why:
      'Gold projects are usually compared by headline ounces. Placing them on a map, sized by study value and dated, shows which ones the economics support and how current those numbers are.',
    how: [
      'Open Goldminer AI and zoom to a region.',
      'Click a project for its study figures, their date, and the company behind it.',
      'Use the peer comparison to see how a project sits against similar ones, or import a CSV to add your own.',
    ],
  },
  {
    id: 'f12-biotech-catalysts',
    order: 12,
    name: 'Biotech Catalysts',
    subject: 'Biotech Catalysts: FDA decisions and data readouts within 90 days',
    preview: 'Biotech companies on the map, pulsing when a catalyst is close.',
    path: '/visualizers/biotech',
    cta: 'Open Biotech Catalysts',
    image: `${IMG}/biotech-2026-09.jpg`,
    imageAlt: 'Biotech Catalysts map',
    what:
      'The Biotech Catalysts visualizer maps biotech companies by headquarters, sized by market cap. A company pulses when an FDA decision or a clinical data readout is due within ninety days, drawn from ClinicalTrials.gov and company filings. Each company shows its cash runway and any insider buying that ran ahead of the catalyst.',
    why:
      'Biotech stocks move on dates. Seeing which catalysts are close, whether the company can fund itself through them, and whether insiders bought beforehand is the context those dates need.',
    how: [
      'Open Biotech Catalysts. Pulsing bubbles have a catalyst inside 90 days.',
      'Click a company for the catalyst date and type, its cash runway, and its insider trades.',
      'Use the city map to see where companies cluster by region.',
    ],
  },
];

export function featureById(id: string): FeatureEmail | undefined {
  return FEATURES.find((f) => f.id === id);
}
