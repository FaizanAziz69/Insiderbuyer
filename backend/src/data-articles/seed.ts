/**
 * Launch articles for the Data Articles system — Developer Project Brief
 * (Aug 24 2026), §3.3, in the brief's order. Seeded ONCE (ON CONFLICT DO
 * NOTHING); editorial edits every text section from the Editorial Desk, the
 * chart module is locked to the endpoint.
 *
 * Copy is neutral and factual (George's standing rule; brief §2.4: no
 * projections, no "follow these picks" language). {{placeholders}} are filled
 * from the live payload on every read so evergreen sentences stay true.
 */

export interface ArticleSections {
  /** "The numbers that matter" takeaway box. */
  takeaways: string[];
  /** 6–10 short body sections. */
  body: Array<{ heading: string; html: string }>;
  pullQuote: { text: string; attribution: string };
  /** "What it means for you", segmented by reader type. */
  whatItMeans: Array<{ audience: string; text: string }>;
  cta: { headline: string; body: string };
}

export interface ArticleSeed {
  slug: string;
  headline: string;
  dek: string;
  category: string;
  refresh: 'weekly' | 'monthly' | 'quarterly';
  chart: 'insider-buys' | 'insider-sells' | 'analysts' | 'hedge-funds';
  periods: string[];
  sections: ArticleSections;
}

const CTA_BODY =
  'Premium members see the Insider Score behind every bar, get the full ranked table beyond the top ten, and receive an alert when a new open-market buy is filed in a company they follow.';

export const LAUNCH_ARTICLES: ArticleSeed[] = [
  {
    slug: 'what-stocks-have-insiders-bought-the-most',
    headline: 'What stocks have insiders bought the most?',
    dek: 'The ten companies where officers, directors and 10% owners spent the most of their own money on open-market purchases, ranked from SEC Form 4 filings and refreshed every week.',
    category: 'Insider Buying',
    refresh: 'weekly',
    chart: 'insider-buys',
    periods: ['30d', '90d'],
    sections: {
      takeaways: [
        'Insiders disclosed {{total}} of open-market purchases across {{companies}} companies in the {{period}}.',
        '{{top1.ticker}} leads the table at {{top1.value}}, with {{top1.insiders}} insider(s) buying at an average of {{top1.avgPrice}}.',
        '{{clusters}} of the top ten show a cluster — three or more insiders buying in the same window.',
        'The top ten account for {{top10Share}} of all disclosed open-market buying in the period.',
      ],
      body: [
        {
          heading: 'What this table counts',
          html: '<p>Every row is built from SEC Form 4 filings with transaction code <b>P</b> — an open-market or private purchase paid for with the insider&rsquo;s own money. Purchases made under a pre-arranged 10b5-1 plan, option exercises, stock awards and dividend reinvestments are excluded, because none of them tells you the insider chose to buy at this price on this day.</p>',
        },
        {
          heading: 'Why the dollar amount, not the share count',
          html: '<p>Share counts flatter low-priced stocks. Ranking by the dollars actually spent puts a $2 million purchase of a $400 stock and a $2 million purchase of a $4 stock on the same footing, which is the comparison most readers want when they ask &ldquo;where are insiders putting real money?&rdquo;</p>',
        },
        {
          heading: 'The leader: {{top1.name}}',
          html: '<p>{{top1.ticker}} tops the {{period}} table at {{top1.value}}. The largest single buyer was {{top1.largest}}, and the volume-weighted average purchase price was {{top1.avgPrice}}; the stock has since moved {{top1.pctSince}} from that level. Hover or focus the bar for the full detail card, including the 52-week-low context.</p>',
        },
        {
          heading: 'Reading the cluster flag',
          html: '<p>A single large purchase can be an estate-planning move, a director topping up to meet an ownership guideline, or a founder who simply has the cash. Three or more insiders buying in the same window is harder to explain away, which is why the chart marks those rows separately. Historically, cluster buys have been a stronger signal than solo buys — but the word is <i>historically</i>; past patterns are not a forecast.</p>',
        },
        {
          heading: 'Insider Score badges',
          html: '<p>The badge beside each ticker is the Insider Score (IQS), our 0–100 rating of how meaningful the buying is once we account for who bought, how much relative to their existing stake, the company&rsquo;s track record after past insider buys, and the market backdrop. Green is 75 or above; gold is 50–74. Companies without enough history carry no badge.</p>',
        },
        {
          heading: 'Average price vs. today',
          html: '<p>&ldquo;% since purchase&rdquo; compares the current price with the volume-weighted average price the insiders paid over the period. A negative figure means the stock is trading below where insiders bought — the market currently disagrees with them. A large positive figure means most of the move has already happened.</p>',
        },
        {
          heading: 'What the table does not tell you',
          html: '<p>It does not show sales, so a company can appear here while other insiders are selling; check the company page for the net picture. It does not know why anyone bought. And the 30- and 90-day windows are calendar windows, so a filing that lands on the boundary can move a company several places from one refresh to the next.</p>',
        },
        {
          heading: 'How often this page updates',
          html: '<p>The aggregates are rebuilt every Friday after the close, and the &ldquo;Updated&rdquo; date at the top of the page is the timestamp of that rebuild. Form 4 filings themselves arrive intraday on the <a href="/trades">live insider trades feed</a>.</p>',
        },
      ],
      pullQuote: {
        text: 'Insiders sell for many reasons — taxes, diversification, a house. They buy on the open market for one reason: they think the stock is worth more than they are paying.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'Use the 90-day view. A company that stays near the top across several refreshes is showing sustained conviction, not one filing.' },
        { audience: 'Active traders', text: 'The 30-day view surfaces fresh filings. Compare the average insider price with today&rsquo;s price before assuming the move is still ahead.' },
        { audience: 'Researchers and journalists', text: 'Every figure traces to a public Form 4. The largest-buyer name on each card is the filer to start with; the company page lists each filing with its SEC link.' },
      ],
      cta: { headline: 'See the score behind every bar', body: CTA_BODY },
    },
  },
  {
    slug: 'what-stocks-have-insiders-sold-the-most',
    headline: 'What stocks have insiders sold the most?',
    dek: 'The ten companies with the largest insider selling by dollar value, with planned 10b5-1 sales separated from discretionary ones — because the difference matters.',
    category: 'Insider Selling',
    refresh: 'weekly',
    chart: 'insider-sells',
    periods: ['30d', '90d'],
    sections: {
      takeaways: [
        'Insiders sold {{total}} of stock across {{companies}} companies in the {{period}} (discretionary sales only).',
        '{{top1.ticker}} leads the discretionary table at {{top1.value}} from {{top1.insiders}} seller(s).',
        'Use the filter above the chart to see planned 10b5-1 sales and discretionary sales separately.',
        'The top ten account for {{top10Share}} of all discretionary selling in the period.',
      ],
      body: [
        {
          heading: 'Two very different kinds of selling',
          html: '<p>A <b>10b5-1 plan</b> is a schedule an insider files in advance; the sales execute automatically whether the stock is up or down, and the insider is not supposed to be acting on anything they know that day. A <b>discretionary</b> sale is a decision made now. Form 4 flags planned sales in a footnote, and this page reads that flag so you can look at the two groups separately.</p>',
        },
        {
          heading: 'Why the default view hides planned sales',
          html: '<p>Large-cap founders and executives sell hundreds of millions of dollars a year on autopilot. Left in, those programmes dominate every ranking and tell you nothing new. The default filter shows discretionary sales; switch to &ldquo;Planned&rdquo; to see the programmes, or &ldquo;All&rdquo; for the total.</p>',
        },
        {
          heading: 'The leader: {{top1.name}}',
          html: '<p>{{top1.ticker}} tops the discretionary table for the {{period}} at {{top1.value}}. The largest single seller was {{top1.largest}}, at a volume-weighted average of {{top1.avgPrice}}; the stock has moved {{top1.pctSince}} from that level since.</p>',
        },
        {
          heading: 'Selling is a weaker signal than buying',
          html: '<p>Academic work and our own backtests agree: insider selling predicts far less than insider buying. Executives are paid largely in stock and have to sell to diversify, pay taxes on vested awards, or fund anything at all. Treat a company on this list as a prompt to look closer, not as a verdict.</p>',
        },
        {
          heading: 'When selling does matter',
          html: '<p>Three patterns are worth attention: several insiders selling discretionarily in the same window (the cluster flag), a seller who has never sold before, and selling that continues while the stock is falling. Each is visible in the detail card or on the company page.</p>',
        },
        {
          heading: 'Distance from the 52-week high',
          html: '<p>The detail card shows how far the current price sits below the 52-week high. Selling near a high is ordinary profit-taking; selling well below it is the less common — and more interesting — case.</p>',
        },
        {
          heading: 'What is excluded',
          html: '<p>Shares withheld to cover taxes on vesting awards (code F), gifts (code G) and option exercises (code M) are not sales in any meaningful sense and are left out. Only transaction code S — an actual disposition for value — counts here.</p>',
        },
        {
          heading: 'Update schedule',
          html: '<p>Rebuilt every Friday after the close; the Updated date at the top of the page is the rebuild timestamp.</p>',
        },
      ],
      pullQuote: {
        text: 'A planned sale tells you what an insider decided months ago. A discretionary sale tells you what they decided this week.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Shareholders', text: 'Check whether the selling in a company you own is planned or discretionary before reacting; the filter changes the picture completely for most large caps.' },
        { audience: 'Active traders', text: 'Cluster discretionary selling below the 52-week high is the pattern historically associated with weaker forward returns. It is context, not a trigger.' },
        { audience: 'Researchers', text: 'The planned flag comes from the Form 4 footnote each filer submits; where a filer omits it, the sale is counted as discretionary.' },
      ],
      cta: { headline: 'Follow the sellers who matter', body: CTA_BODY },
    },
  },
  {
    slug: 'top-performing-analysts',
    headline: 'Who are the top performing stock analysts?',
    dek: 'A leaderboard of individual Wall Street analysts ranked by the hit rate of their calls and the average return that followed, measured over the trailing twelve months and refreshed monthly.',
    category: 'Analysts',
    refresh: 'monthly',
    chart: 'analysts',
    periods: ['12m'],
    sections: {
      takeaways: [
        '{{top1.label}} leads with a {{top1.value}} hit rate on seasoned calls and an average return of {{top1.avgReturn}}.',
        'The leaderboard is drawn from {{ratings}} rated calls by {{analysts}} named analysts.',
        'The average realised return across the top ten is {{avgReturnTop10}}.',
        'Only analysts with at least {{minGradedCalls}} graded calls qualify ({{eligibleAnalysts}} do); ranking uses the sample-adjusted lower bound of the hit rate, so a perfect record on a handful of calls cannot top the table.',
      ],
      body: [
        {
          heading: 'How a call is graded',
          html: '<p>Each published rating with a price target is compared with the stock&rsquo;s price at the time of the note. A target more than 3% above the price is a bullish call; more than 3% below is bearish; anything inside that band is a reiteration and is not graded. The call is then scored against the subsequent closes: a bullish call &ldquo;hits&rdquo; if the stock rises, a bearish one if it falls.</p>',
        },
        {
          heading: 'Hit rate is the bar, return is the tiebreaker',
          html: '<p>Bars show the share of graded calls that moved in the analyst&rsquo;s direction. Where two analysts have the same hit rate, the one whose calls produced the larger average move ranks higher. Both numbers are on the detail card.</p>',
        },
        {
          heading: 'Why calls need to season',
          html: '<p>A rating published yesterday cannot be judged yet. Calls are graded only once they are at least 30 days old, and this leaderboard admits only analysts with at least 20 graded calls. Even then, 6-for-6 is luck as often as skill, so the ranking uses the statistical lower bound of each hit rate (the 95% Wilson interval): 27 hits from 32 calls outranks a perfect 8 from 8. The bar still shows the plain hit rate.</p>',
        },
        {
          heading: 'The leader: {{top1.label}}',
          html: '<p>{{top1.label}} sits first with a {{top1.value}} hit rate across {{top1.ratings}} rated calls, and an average subsequent return of {{top1.avgReturn}}. Click the name to open the rating history.</p>',
        },
        {
          heading: 'Junk targets are filtered out',
          html: '<p>Data vendors occasionally ship nonsense — a $700 target on a $180 stock. A note is only graded when the target sits within 0.4×–2.0× of the price on the day of the note and within three times the consensus. This keeps a data error from inflating anyone&rsquo;s record.</p>',
        },
        {
          heading: 'What a good hit rate looks like',
          html: '<p>Analysts as a group are right a little more often than not — the market drifts upward and most calls are bullish. A hit rate in the 70s over a meaningful number of calls is unusual; above 80 over many calls is rare; 100% over any real sample does not exist, which is why a name showing it has simply not made enough calls yet. Sample size matters more than the headline percentage.</p>',
        },
        {
          heading: 'Sector concentration',
          html: '<p>Most analysts cover one sector. The detail card shows the sector an analyst&rsquo;s rated symbols cluster in, because a strong record in a sector that happened to rally is a different thing from a strong record against the tape.</p>',
        },
        {
          heading: 'Update schedule',
          html: '<p>Ratings are collected continuously; the leaderboard is rebuilt on the first of each month, and the Updated date reflects that rebuild.</p>',
        },
      ],
      pullQuote: {
        text: 'The question is never whether an analyst was right once. It is how often, over how many calls, and by how much.',
        attribution: 'InsiderBuying.com methodology note',
      },
      whatItMeans: [
        { audience: 'Individual investors', text: 'When you read an upgrade, look up the analyst here first. The same headline from a 55% analyst and an 80% analyst is not the same information.' },
        { audience: 'Active traders', text: 'The Top Analyst Stocks list applies this leaderboard to the market: stocks where several high-hit-rate analysts agree, ranked by their average target.' },
        { audience: 'Professionals', text: 'Hit rates here are directional, not target-attainment. An analyst can be counted right without the stock reaching the target.' },
      ],
      cta: { headline: 'See every analyst call, graded', body: 'Premium members get the full leaderboard, every analyst&rsquo;s complete rating history, and the Top Analyst Stocks list built from the calls of the analysts who are actually right.' },
    },
  },
  {
    slug: 'top-performing-hedge-funds',
    headline: 'Which hedge funds are performing best?',
    dek: 'The best-performing managers on our tracked roster, ranked by the trailing-twelve-month return of the U.S. long positions they disclose in quarterly 13F filings. Refreshed each quarter when new filings land.',
    category: 'Hedge Funds',
    refresh: 'quarterly',
    chart: 'hedge-funds',
    periods: ['ttm'],
    sections: {
      takeaways: [
        '{{top1.label}} leads the roster with a {{top1.value}} trailing-twelve-month return on disclosed positions.',
        'Performance is measured for {{withPerformance}} of the {{tracked}} tracked managers; the rest fall below our size or position thresholds.',
        'The latest 13F quarter in the data is {{latestQuarter}}.',
        'These are the returns of the disclosed long book only — not the funds&rsquo; reported returns.',
      ],
      body: [
        {
          heading: 'What a 13F shows — and what it hides',
          html: '<p>Any manager with more than $100 million in U.S. equities must file Form 13F within 45 days of each quarter-end, listing their long positions in U.S.-listed stocks and options. It does not show short positions, non-U.S. holdings, bonds, cash or private investments, and it is at least 45 days stale on the day it appears. Every figure on this page inherits those limits.</p>',
        },
        {
          heading: 'How the return is calculated',
          html: '<p>For each quarter-to-quarter leg we weight every disclosed position by its value at the start of the leg and measure the change in each holding&rsquo;s price to the end of the leg. Legs are chained to produce a trailing-twelve-month figure, with the current leg marked to live prices. The full method is on the <a href="/methodology#top-insiders">methodology page</a>.</p>',
        },
        {
          heading: 'Why some managers show no return',
          html: '<p>A portfolio under $100 million of disclosed value, or with fewer than four positions, produces a number too noisy to publish, so it is suppressed. A manager whose filings we cannot yet match to a filer ID shows no data at all.</p>',
        },
        {
          heading: 'The leader: {{top1.label}}',
          html: '<p>{{top1.label}} ranks first at {{top1.value}}, with {{top1.positions}} disclosed positions worth {{top1.aum}} at the latest filing. The detail card lists the largest holdings; the manager page shows every position and each quarter&rsquo;s changes.</p>',
        },
        {
          heading: 'Concentration changes everything',
          html: '<p>A ten-position book and a five-thousand-position book can post the same return for entirely different reasons. The position count on each card is there to be read alongside the percentage — a concentrated manager&rsquo;s figure says something about their picks; a diversified giant&rsquo;s says something about the market.</p>',
        },
        {
          heading: 'Where insiders and funds agree',
          html: '<p>Our angle: each manager card shows the holdings where company insiders have also been buying on the open market in the last 90 days. When a fund holds a stock and its own executives are buying, two independent groups with different information are reaching the same conclusion.</p>',
        },
        {
          heading: 'This is not the fund&rsquo;s reported return',
          html: '<p>Funds report returns to investors net of fees, including shorts, hedges, leverage and non-U.S. positions. None of that is public. The figure here is a transparent proxy built from public filings — useful for comparing the disclosed long books across managers, not for judging the fund.</p>',
        },
        {
          heading: 'Update schedule',
          html: '<p>Positions update as new 13Fs are filed each quarter; the performance figure is re-marked to live prices nightly. This article is rebuilt the day after each 45-day filing window closes.</p>',
        },
      ],
      pullQuote: {
        text: 'A 13F is a photograph of the long book, taken up to 45 days ago, with the short side cropped out. Read it as such.',
        attribution: 'InsiderBuying.com methodology note',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'Look at multi-quarter consistency on the manager page rather than one trailing-twelve-month number; a single strong quarter moves the ranking.' },
        { audience: 'Stock pickers', text: 'The overlap badge — holdings with recent open-market insider buying — is where fund conviction and insider conviction coincide.' },
        { audience: 'Professionals', text: 'Returns are value-weighted, rebalanced at filing dates, and cover the top 100 positions by value; the methodology page documents every step.' },
      ],
      cta: { headline: 'Track every position, every quarter', body: 'Premium members get complete holdings for all tracked managers, quarter-over-quarter changes, and alerts when a tracked fund&rsquo;s holding also draws open-market insider buying.' },
    },
  },
];
