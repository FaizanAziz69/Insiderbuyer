/**
 * "GET ON THE INSIDE" — the free investor report (lead magnet).
 *
 * Transcribed VERBATIM from George's approved document
 * (InsiderBuying_Free_Report_Lead_Magnet.docx, September 2026 edition,
 * received 2026-09-16: "mujhe yeh docs 100 percent bana ha, exact same
 * implement karo"). Copy changes go here and nowhere else; the renderer in
 * free-report-pdf.ts only lays this out.
 *
 * The one thing the document leaves to us is the three charts ("[ INSERT
 * CHART ]" with a spec each). Their marker dates below were checked against
 * the actual Form 4s on 2026-09-16:
 *   BABA  Wu Yongming 350,000 sh @ $14.24 and Joseph Tsai 720,000 sh @ $14.29
 *         (both 2026-08-24), Tsai 720,000 sh @ $14.47 (2026-08-25) — ordinary
 *         shares; the chart is the NYSE ADS.
 *   CSGP  Florance 55,720 sh @ $44.52 (2026-02-27), 68,330 @ $35.17 + 3,100 @
 *         $35.82 (2026-05-01), 83,300 @ $29.89 (2026-08-04).
 *   ENOV  Engert 2,458 @ $20.32 (2026-09-02) + 5,140 @ $19.46 (2026-09-03),
 *         McDonald 13,035 @ $19.15 (2026-09-04).
 */

export const EDITION = 'September 2026 Edition';

export const COVER = {
  kicker: 'FREE INVESTOR REPORT',
  title: 'GET ON THE INSIDE',
  subtitle: 'A Guide to Following Insider Buying',
  sub2: '— and 3 Stocks Insiders Are Buying Right Now —',
  publisher: 'Published by InsiderBuying.com',
  edition: EDITION,
  legal: 'For informational purposes only. Not financial advice. See full disclaimer on the final page.',
};

export const EDITOR_NOTE = {
  heading: 'A Note From the Editor',
  paragraphs: [
    'Ever feel like the market is rigged?',
    'You’re not crazy.',
    'Every stock you buy, someone on the inside already knows how the story ends. They see the sales numbers before the quarter closes. They see the contracts before the press release. They see the problems before the apology tour.',
    'Here’s the part almost nobody uses: every time those insiders buy or sell their own stock, they’re required by federal law to tell you — in public filings, within two business days.',
    'And when corporate executives, board members, and major stakeholders start purchasing shares at unusual and unprecedented rates, you know it’s time to pay attention.',
    'Why? Because these people have the closest possible view of their company — its financial health, its prospects, its growth potential. When insiders buy, it can mean one thing above all: they have real confidence in their company’s future. And when insiders and analysts directly disagree, history suggests you should think hard before siding with the analysts.',
    'Remember: an insider can sell stock for any number of reasons... a down payment on a house, a medical emergency, or plain old profit-taking. But when an insider reaches into their own pocket and uses their hard-earned money to buy their company’s stock on the open market, there is usually only one reason:',
    '**They expect the stock price to go up.**',
    'Tracking insider transactions opens a window into opportunities that traditional finance never shows regular investors. Reading thousands of filings a week, however, is a full-time job.',
    'At InsiderBuying.com, we do that for you.',
    'In the next few pages, you’ll learn exactly how the insider buying signal works, why decades of research back it up — and you’ll get three stocks where insiders are putting their own money to work right now.',
    'Welcome to the inside.',
  ],
  signoff: '— The InsiderBuying.com Editorial Team',
};

export type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'callout'; label: string; text: string }
  | { kind: 'quote'; text: string; by: string }
  | { kind: 'footnote'; text: string };

export const PART_ONE = {
  heading: 'Part One: Why the Smartest Money in the Market Is the Money Inside It',
  blocks: [
    { kind: 'h2', text: 'Who Counts as an “Insider”?' },
    {
      kind: 'p',
      text: 'Under U.S. securities law, a corporate insider is anyone with access to material, non-public information about a company and a duty to disclose their trades. In practice, that means:',
    },
    {
      kind: 'bullets',
      items: [
        '**Officers** — the CEO, CFO, COO, presidents, and other senior executives who run the business day to day.',
        '**Directors** — the board members who oversee strategy, approve budgets, and see everything before the public does.',
        '**10% owners** — any shareholder controlling more than 10% of a company’s stock.',
      ],
    },
    {
      kind: 'p',
      text: 'Every time one of these people buys or sells company stock, they must report it to the SEC on a document called Form 4 — generally within two business days. (In Canada, the equivalent filings appear on SEDI.) These filings are public. Free. Available to anyone.',
    },
    {
      kind: 'p',
      text: 'The catch? Thousands of them are filed every week, buried in legal formatting and mixed with noise. That’s where most investors give up — and where the edge begins.',
    },

    { kind: 'h2', text: 'Why Insider Buying Is a Reputable, Proven Signal' },
    { kind: 'p', text: 'This isn’t a fringe theory. It’s one of the most studied phenomena in modern finance.' },
    {
      kind: 'p',
      text: 'A stock is just a company controlled and run by a small group of individuals. These people are corporate operators of the highest order — precise, deliberate, and well trained. They don’t join a board because they think they know how to increase its value. They join because they know exactly how.',
    },
    {
      kind: 'p',
      text: 'When those same people spend their own money buying shares on the open market, they are making a statement no press release can match. Talk is marketing. A large open-market buy is conviction.',
    },

    { kind: 'h2', text: 'The Harvard Case Study' },
    {
      kind: 'callout',
      label: 'What the academics found',
      text:
        'In a landmark study, researchers Leslie Jeng, Andrew Metrick, and Harvard’s Richard Zeckhauser analyzed decades of insider transactions in “Estimating the Returns to Insider Trading: A Performance-Evaluation Perspective.”\n\n' +
        'Their finding: portfolios mimicking insider PURCHASES earned abnormal returns of more than 6% per year above the market — while insider sales showed no significant predictive value.',
    },
    {
      kind: 'p',
      text: 'Translation: when insiders buy, it has historically meant something. When they sell, it often doesn’t. That asymmetry is the foundation of everything we do.',
    },

    { kind: 'h2', text: 'The Famous Peter Lynch Quote' },
    {
      kind: 'p',
      text: 'Legendary Fidelity Magellan manager Peter Lynch — who averaged roughly 29% annual returns from 1977 to 1990 — summed up the entire discipline in one sentence:',
    },
    {
      kind: 'quote',
      text: '“Insiders might sell their shares for any number of reasons, but they buy them for only one: they think the price will rise.”',
      by: 'Peter Lynch',
    },

    { kind: 'h2', text: 'The Track Record: Decades of Outperformance' },
    {
      kind: 'p',
      text: 'Multiple academic studies across more than 30 years of market history have reached the same conclusion: stocks with meaningful insider buying have, on average, outperformed the broader market — with several major studies putting the historical edge in the range of 6% or more per year for insider-purchase portfolios.*',
    },
    {
      kind: 'p',
      text: 'Professional investors have quietly used this signal for decades. Hedge funds monitor Form 4 feeds in real time. The information gap was never supposed to close. We’re closing it.',
    },
    { kind: 'footnote', text: '*Past performance does not guarantee future results. Insider activity is one input among many, not a crystal ball.' },

    { kind: 'h2', text: 'The Strongest Version of the Signal: Cluster Buying' },
    { kind: 'p', text: 'One insider buying is interesting. It might be optimism; it might be a show of faith.' },
    {
      kind: 'p',
      text: 'But when three, five, or nine insiders at the same company all buy within days of each other — the CEO, the CFO, several directors — that’s not optimism. That’s consensus from the people who see the numbers first.',
    },
    {
      kind: 'p',
      text: 'This is called a **cluster buy**, and it is widely considered the single strongest pattern in insider trading analysis. Cluster buys rarely make headlines. Financial media covers celebrity CEOs, not three directors and a CFO quietly stepping in near a 52-week low. That’s exactly why the opportunity persists.',
    },

    { kind: 'h2', text: 'The Key Concept Behind It All: Information Asymmetry' },
    {
      kind: 'p',
      text: 'Information asymmetry is when one side of a trade simply knows more than the other. It is the most lucrative force in the markets — and insiders live on the right side of it, because they’re close to the business.',
    },
    {
      kind: 'p',
      text: 'You cannot trade on non-public information. That’s illegal. But you can do the next best thing, 100% legally: watch what the informed money does the moment it’s disclosed — and act on the pattern. **Insider trading is illegal. Insider tracking is not.**',
    },

    { kind: 'h2', text: 'How to Put It All Together' },
    {
      kind: 'p',
      text: 'Here’s the honest truth: raw insider data will mislead you. An option exercise looks like a buy but signals nothing. A scheduled 10b5-1 sale looks bearish but is often routine. A $50,000 buy is a rounding error for one executive and a massive commitment for another.',
    },
    { kind: 'p', text: 'That’s why, at InsiderBuying.com, we don’t just track insider purchases. We track and measure:' },
    {
      kind: 'bullets',
      items: [
        '**Who is buying** — a CFO or CEO buy carries more signal than a junior director’s.',
        '**Transaction type** — open-market purchases only; option exercises and grants are filtered as noise.',
        '**Ownership increases** — how much did this buy grow the insider’s existing stake?',
        '**Purchase size relative to market cap** — $1M into a $200M company means far more than $1M into a $200B one.',
        '**Purchase size relative to the insider’s wealth and salary** — conviction is measured against what they could afford to lose.',
        '**Purchase frequency** — first-ever buys and sudden acceleration matter more than routine accumulation.',
        '**Clustering** — how many distinct insiders bought, and how tight the window.',
        '**Timing context** — buys near 52-week lows, after sell-offs, or ahead of catalysts.',
        '**Insider track records** — has this specific person been right before?',
      ],
    },
    {
      kind: 'p',
      text: 'All of it rolls up into one number: **the IQ Score** — the Insider Quality Score — a 0-to-100 grade of insider conviction on any stock. And every score comes with receipts: the actual filings, one click away.',
    },
    { kind: 'p', text: 'Now let’s put the signal to work. Here are three stocks where insiders are buying right now.' },
  ] as Block[],
};

export interface ChartMarker {
  date: string; // YYYY-MM-DD
  label: string;
}

export interface StockSection {
  number: number;
  name: string;
  exchange: string;
  ticker: string;
  /** FMP symbol for the 1-year daily chart. */
  chartSymbol: string;
  tags: string[];
  chartSpec: string;
  /** Purchase dates to mark with gold arrows and "INSIDERS BOUGHT HERE". */
  markers: ChartMarker[];
  /** Optional horizontal reference line (e.g. the 52-week low). */
  refLine?: { price: number; label: string };
  /** Optional shaded date range, e.g. a drawdown. */
  band?: { from: string; to: string; label: string };
  qa: Array<{ q: string; a: string }>;
}

export const PART_TWO = {
  heading: 'Part Two: 3 Stocks Insiders Are Buying Right Now',
  intro:
    'All insider transactions and analyst figures below are drawn from public filings and published research coverage as of mid-September 2026. Verify current data at InsiderBuying.com before making any decision — filings update daily.',
  stocks: [
    {
      number: 1,
      name: 'Alibaba Group Holding Ltd.',
      exchange: 'NYSE',
      ticker: 'BABA',
      chartSymbol: 'BABA',
      tags: ['BIG BUY', 'C-SUITE BUY', 'BUY-THE-DIP'],
      chartSpec:
        '1-year daily line chart. The 2026 drawdown (shares down ~20%+ YTD at time of purchases) and the Wu/Tsai purchase window are marked.',
      markers: [{ date: '2026-08-24', label: 'INSIDERS BOUGHT HERE' }],
      band: { from: '2026-01-02', to: '2026-08-25', label: '2026 drawdown' },
      qa: [
        {
          q: '1. What do they do?',
          a: 'Alibaba is China’s e-commerce and cloud-computing giant — and one of the largest purchasers of AI hardware outside the United States. Its cloud business recently grew 45% year over year, and AI-related product revenue has grown at triple-digit rates for twelve consecutive quarters, with the company’s Zhenwu chips now used by more than 650 cloud customers. Heavy AI investment, however, has pressured near-term profitability, and the stock has sold off hard in 2026.',
        },
        {
          q: '2. What did insiders do?',
          a: 'They stepped in — at the very top of the company. CEO Eddie Wu and co-founder/director Joseph Tsai together purchased roughly $15 million of Alibaba shares during the drawdown. When a chief executive and a co-founder deploy eight figures of personal capital into a falling stock, that is the definition of a conviction signal.',
        },
        {
          q: '3. Why might insiders be buying?',
          a: 'The market is punishing Alibaba for spending on AI. Insiders sit closest to the data on whether that spending is working — cloud growth, chip adoption, AI revenue — and their buying suggests they believe the market is mispricing a long-term transformation as a short-term problem.',
        },
        {
          q: '4. Do analysts cover the stock?',
          a: 'Extensively. Wall Street coverage remains broadly bullish, with a consensus price target near $189 — implying more than 60% upside from recent levels at the time of the insider purchases. In other words: this is a rare case where insiders and analysts agree, while the price disagrees with both.',
        },
      ],
    },
    {
      number: 2,
      name: 'CoStar Group, Inc.',
      exchange: 'NASDAQ',
      ticker: 'CSGP',
      chartSymbol: 'CSGP',
      tags: ['CEO CONVICTION', 'REPEAT BUYER', 'MULTI-YEAR LOW'],
      chartSpec: '1-year daily line chart. The slide to seven-year lows and each of Florance’s 2026 purchase dates (Feb, May, and Q3) are marked.',
      markers: [
        { date: '2026-02-27', label: 'INSIDERS BOUGHT HERE' },
        { date: '2026-05-01', label: 'INSIDERS BOUGHT HERE' },
        { date: '2026-08-04', label: 'INSIDERS BOUGHT HERE' },
      ],
      qa: [
        {
          q: '1. What do they do?',
          a: 'CoStar Group is the dominant data and analytics provider for commercial real estate — the Bloomberg of property. Founded by CEO Andrew Florance in 1987, it owns platforms including CoStar, LoopNet, Apartments.com, and Homes.com, and recently completed its acquisition of the Zonda real estate platform. Q1 2026 revenue grew 23% year over year with adjusted EBITDA doubling, yet the stock has fallen to multi-year lows as the market questions its heavy investment in residential marketplaces.',
        },
        {
          q: '2. What did insiders do?',
          a: 'The founder-CEO has been buying his own stock all year — repeatedly. Florance made a rare purchase in February 2026 (~$2.6M), added another ~$2.5M in May at roughly $35 per share, and has continued accumulating, with net purchases of roughly $5 million over the trailing twelve months as the stock declined. A founder buying the dip in the company he built — again and again — is one of the most compelling repeat-buyer patterns on the market right now.',
        },
        {
          q: '3. Why might insiders be buying?',
          a: 'Florance has spent nearly four decades building CoStar and knows its unit economics better than anyone alive. His buying suggests he believes the market is over-punishing the residential growth investments while ignoring the core business’s compounding — a view reinforced by the company reaffirming full-year 2026 guidance of roughly $3.8 billion in revenue (~17% growth).',
        },
        {
          q: '4. Do analysts cover the stock?',
          a: 'Yes — 15–21 analysts depending on the tally. The consensus rating is Buy/Moderate Buy. Price targets have been trimmed across 2026 and are widely dispersed — recent published means range from the high-$30s to high-$40s, with a street-high of $70 — but virtually all sit meaningfully above the recent share price in the low-to-mid $30s. Analysts are cautious on timing; the founder is not.',
        },
      ],
    },
    {
      number: 3,
      name: 'Enovis Corporation',
      exchange: 'NYSE',
      ticker: 'ENOV',
      chartSymbol: 'ENOV',
      tags: ['CLUSTER BUY', '52-WEEK LOW', 'FRESH FILING'],
      chartSpec: '1-year daily line chart. The ~25% early-September drop to the 52-week low ($18.52) and the Sept 2–4 cluster purchases are marked.',
      markers: [{ date: '2026-09-03', label: 'INSIDERS BOUGHT HERE' }],
      refLine: { price: 18.52, label: '52-week low $18.52' },
      qa: [
        {
          q: '1. What do they do?',
          a: 'Enovis is a medical-technology company focused on orthopedics — surgical implants, reconstructive solutions, and rehabilitation devices. The company recently beat earnings expectations (Q2 adjusted EPS of $0.90 vs. $0.85 consensus), reaffirmed full-year 2026 EPS guidance of $3.52–$3.73, and closed a strategic acquisition of eCential Robotics to enter surgical robotics. Despite that, deal-related costs and leverage concerns sent the stock down roughly 25% in a single week in early September — to a fresh 52-week low.',
        },
        {
          q: '2. What did insiders do?',
          a: 'They ran toward the falling knife — together. On September 4, 2026, CEO Damien McDonald bought 13,035 shares (~$250,000) at $19.10–$19.16, bringing his direct stake to roughly $4.6 million. Two days earlier, Chief Administrative Officer Oliver Engert bought ~$150,000 of stock at $20.32 — his second purchase of 2026. Two senior executives buying within the same week, at the lows, is a textbook cluster buy.',
        },
        {
          q: '3. Why might insiders be buying?',
          a: 'The executives just reaffirmed their own full-year guidance — and then bought stock at prices implying the market doesn’t believe them. If management is right about the earnings trajectory and the robotics acquisition, they just purchased their own company near the cheapest levels in a year.',
        },
        {
          q: '4. Do analysts cover the stock?',
          a: 'Yes — roughly 8–18 analysts depending on the tally, with a consensus rating of Buy/Strong Buy. Even after post-acquisition target cuts in early September (BTIG to $36, Citizens to $47, BMO to $27, Wells Fargo and Canaccord maintaining Buy), the published targets sit dramatically above the ~$18.50 share price — several implying 60%+ upside. Analysts and insiders are aligned; the price is the outlier.',
        },
      ],
    },
  ] as StockSection[],
  important: {
    label: 'Important',
    text: 'These three situations illustrate the insider buying signal in action — they are not personalized recommendations. Insider buying improves the odds; it does not eliminate risk. Insiders can be early, and insiders can be wrong. Always do your own complete due diligence, size positions responsibly, and consult a licensed advisor where appropriate.',
  },
};

export const CLOSE = {
  heading: 'You’ve Seen the Signal. Now Get On the Inside.',
  paragraphs: [
    'Everything in this report came from public filings — filings that drop by the thousands, every single week. New Alibabas. New CoStars. New Enovis-style cluster buys at 52-week lows.',
    'The only question is whether you’re watching.',
    '**InsiderBuying.com Premium — Insider Access — was built to watch for you:**',
  ],
  tableHead: ['Feature', 'What You Get on the Inside'],
  features: [
    ['IQ Score™ (Insider Quality Score)', 'Our 0–100 conviction grade on any stock — weighing who bought, how, how much, and how many. Unlimited searches, every ticker.'],
    ['Top Buys Tracker', 'A live, ranked feed of the most significant insider purchases on the market — updated as filings drop.'],
    ['Cluster-Buy Screener', 'Instantly surfaces stocks where multiple insiders are buying in tight windows — the strongest pattern in the discipline, before it makes headlines (it usually never does).'],
    ['Real-Time Insider Alerts', 'The moment an insider moves on any stock you own or watch, you know — push and email.'],
    ['Congress Trades', 'Track disclosed trades by U.S. politicians alongside corporate insiders — the full smart-money picture in one place.'],
    ['Insider Track Records', 'See any insider’s full buying history and how their past purchases played out. Follow the ones who’ve been right.'],
    ['The Weekly Insider Briefing', 'Every week: the highest and lowest IQ Scores on the market, the most notable cluster buys, and what we’re watching.'],
    ['Receipts on Everything', 'Every score, every alert, every ranking links directly to the underlying SEC filings. Verify it all yourself.'],
  ] as Array<[string, string]>,
  tagline: 'Search a stock. Find out what insiders are doing. Get on the inside.',
  cta: 'Start your free trial at InsiderBuying.com — full access, cancel anytime.',
};

export const DISCLAIMER = {
  heading: 'Disclaimer',
  text:
    'This report is published by InsiderBuying.com for informational and educational purposes only and does not constitute investment advice, a recommendation, or a solicitation to buy or sell any security. The publisher is not a registered investment advisor or broker-dealer. All insider transaction data is sourced from public SEC filings; analyst ratings and price targets are compiled from publicly available third-party research and may have changed since publication. Past performance — including historical studies of insider-purchase returns — does not guarantee future results. Investing involves risk, including possible loss of principal. Always conduct your own due diligence and consult a licensed financial advisor before making investment decisions. The publisher and its principals may hold positions in securities mentioned.',
};
