// News-topic configuration for the AI topic-roundup engine. Each topic maps
// to: the news tag used to pull matching real source headlines, and a set of
// representative tickers used to ground the article in live market data so
// the roundup is substantive even when the source feeds are sparse.
export interface TopicConfig {
  slug: string;
  label: string;
  /** Tag understood by NewsService for pulling matching source headlines. */
  newsTag: string;
  /** Representative tickers — cross-referenced against our Insider Score/quote data. */
  tickers: string[];
  /** One-line angle for the AI editor. */
  angle: string;
  /** Sector hint that drives the cover-photo bucket + AI image scene so the
   *  cover looks like the topic (biotech → lab, semis → wafer, etc.). */
  photoSector: string;
}

export const TOPICS: TopicConfig[] = [
  {
    slug: 'ai',
    label: 'AI',
    newsTag: 'ai',
    tickers: ['NVDA', 'MSFT', 'GOOGL', 'META', 'AMD', 'PLTR', 'AVGO', 'CRM'],
    photoSector: 'Technology',
    angle:
      'artificial-intelligence leaders — chipmakers, hyperscalers and software platforms driving the AI build-out',
  },
  {
    slug: 'biotech',
    label: 'Biotech',
    newsTag: 'biotech',
    tickers: ['LLY', 'MRNA', 'ABBV', 'AMGN', 'PFE', 'MRK', 'JNJ', 'GILD'],
    photoSector: 'Healthcare Pharmaceutical Biotech',
    angle:
      'biotech and pharma — drug pipelines, FDA catalysts and large-cap pharma',
  },
  {
    slug: 'ev',
    label: 'Electric Vehicles',
    newsTag: 'ev',
    tickers: ['TSLA', 'RIVN', 'GM', 'F', 'ALB', 'FCX'],
    photoSector: 'Consumer Discretionary',
    angle: 'electric vehicles and the battery/charging supply chain',
  },
  {
    slug: 'etf',
    label: 'ETFs',
    newsTag: 'etf',
    tickers: ['SPY', 'IVV', 'GLD', 'SLV', 'TLT', 'IEMG'],
    photoSector: 'Financial Services',
    angle: 'exchange-traded funds and the flows shaping major index and commodity ETFs',
  },
  {
    slug: 'macro',
    label: 'Macro',
    newsTag: 'macro',
    tickers: ['JPM', 'BAC', 'GS', 'XOM', 'WMT', 'NEE'],
    photoSector: 'Financial Services',
    angle:
      'the macro backdrop — rates, inflation and the Fed — and how it is read across rate-sensitive sectors',
  },
  {
    slug: 'markets',
    label: 'Markets',
    newsTag: 'markets',
    tickers: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'JPM'],
    photoSector: 'Financial Services',
    angle: 'the broad U.S. equity market — index leaders and breadth',
  },
  {
    slug: 'ma',
    label: 'Mergers & Acquisitions',
    newsTag: 'ma',
    tickers: ['MSFT', 'GOOGL', 'JPM', 'GS', 'AVGO', 'ORCL'],
    photoSector: 'Financial Services',
    angle: 'mergers, acquisitions and corporate deal-making',
  },
  {
    slug: 'semis',
    label: 'Semiconductors',
    newsTag: 'semis',
    tickers: ['NVDA', 'AMD', 'AVGO', 'MU', 'QCOM', 'TXN', 'AMAT', 'LRCX'],
    photoSector: 'Semiconductor Technology',
    angle: 'the semiconductor complex — designers, foundries and equipment makers',
  },
];

export const TOPIC_BY_SLUG: Record<string, TopicConfig> = Object.fromEntries(
  TOPICS.map((t) => [t.slug, t]),
);
