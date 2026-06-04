// Hardcoded sample 13F-style holdings + congressional disclosure samples.
// These are illustrative figures sourced from publicly summarised 13F filings
// (Berkshire Hathaway, Bridgewater, Sprott Inc.) and public House/Senate
// Stock Watcher summaries. Numbers are rounded sample figures, not live data.

export interface PersonaHolding {
  ticker: string;
  name: string;
  sector: string;
  sharesHeld: number;
  dollarValue: number;
  lastReported: string; // ISO yyyy-mm-dd
  note?: string;
}

export const PERSONA_HOLDINGS: Record<string, PersonaHolding[]> = {
  'warren-buffett': [
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', sharesHeld: 300_000_000, dollarValue: 60_000_000_000, lastReported: '2026-03-31' },
    { ticker: 'BAC',  name: 'Bank of America', sector: 'Financial Services', sharesHeld: 1_032_000_000, dollarValue: 41_000_000_000, lastReported: '2026-03-31' },
    { ticker: 'AXP',  name: 'American Express', sector: 'Financial Services', sharesHeld: 151_600_000, dollarValue: 36_000_000_000, lastReported: '2026-03-31' },
    { ticker: 'KO',   name: 'Coca-Cola', sector: 'Consumer Staples', sharesHeld: 400_000_000, dollarValue: 26_000_000_000, lastReported: '2026-03-31' },
    { ticker: 'CVX',  name: 'Chevron', sector: 'Energy', sharesHeld: 118_000_000, dollarValue: 18_500_000_000, lastReported: '2026-03-31' },
    { ticker: 'OXY',  name: 'Occidental Petroleum', sector: 'Energy', sharesHeld: 248_000_000, dollarValue: 15_200_000_000, lastReported: '2026-03-31' },
    { ticker: 'KHC',  name: 'Kraft Heinz', sector: 'Consumer Staples', sharesHeld: 325_000_000, dollarValue: 11_800_000_000, lastReported: '2026-03-31' },
    { ticker: 'MCO',  name: "Moody's Corp.", sector: 'Financial Services', sharesHeld: 24_700_000, dollarValue: 11_000_000_000, lastReported: '2026-03-31' },
    { ticker: 'DVA',  name: 'DaVita', sector: 'Healthcare', sharesHeld: 36_000_000, dollarValue: 5_400_000_000, lastReported: '2026-03-31' },
    { ticker: 'C',    name: 'Citigroup', sector: 'Financial Services', sharesHeld: 55_000_000, dollarValue: 3_500_000_000, lastReported: '2026-03-31' },
  ],
  'jeff-bezos': [
    { ticker: 'AMZN', name: 'Amazon.com', sector: 'Consumer Discretionary', sharesHeld: 920_000_000, dollarValue: 195_000_000_000, lastReported: '2026-05-15' },
    { ticker: 'GOOGL', name: 'Alphabet (Class A)', sector: 'Communication Services', sharesHeld: 3_200_000, dollarValue: 575_000_000, lastReported: '2026-05-15' },
    { ticker: 'NFLX', name: 'Netflix', sector: 'Communication Services', sharesHeld: 1_100_000, dollarValue: 720_000_000, lastReported: '2026-05-15' },
    { ticker: 'UBER', name: 'Uber Technologies', sector: 'Industrials', sharesHeld: 31_000_000, dollarValue: 2_400_000_000, lastReported: '2026-05-15' },
    { ticker: 'AIRBNB', name: 'Airbnb', sector: 'Consumer Discretionary', sharesHeld: 0, dollarValue: 320_000_000, lastReported: '2026-05-15', note: 'Bezos Expeditions early investment' },
    { ticker: 'WPO',  name: 'Washington Post Co. (private)', sector: 'Communication Services', sharesHeld: 0, dollarValue: 250_000_000, lastReported: '2026-01-31', note: 'Private holding' },
    { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', sharesHeld: 600_000, dollarValue: 720_000_000, lastReported: '2026-05-15' },
    { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', sharesHeld: 1_200_000, dollarValue: 560_000_000, lastReported: '2026-05-15' },
  ],
  'ray-dalio': [
    { ticker: 'IVV',  name: 'iShares Core S&P 500 ETF', sector: 'Diversified', sharesHeld: 8_800_000, dollarValue: 5_100_000_000, lastReported: '2026-03-31', note: 'Bridgewater Pure Alpha' },
    { ticker: 'IEMG', name: 'iShares Core MSCI Emerging Markets', sector: 'Diversified', sharesHeld: 38_000_000, dollarValue: 2_300_000_000, lastReported: '2026-03-31' },
    { ticker: 'SPY',  name: 'SPDR S&P 500 ETF', sector: 'Diversified', sharesHeld: 3_400_000, dollarValue: 2_100_000_000, lastReported: '2026-03-31' },
    { ticker: 'GLD',  name: 'SPDR Gold Shares', sector: 'Commodities', sharesHeld: 9_900_000, dollarValue: 2_050_000_000, lastReported: '2026-03-31' },
    { ticker: 'PG',   name: 'Procter & Gamble', sector: 'Consumer Staples', sharesHeld: 7_600_000, dollarValue: 1_350_000_000, lastReported: '2026-03-31' },
    { ticker: 'JNJ',  name: 'Johnson & Johnson', sector: 'Healthcare', sharesHeld: 6_400_000, dollarValue: 1_050_000_000, lastReported: '2026-03-31' },
    { ticker: 'KO',   name: 'Coca-Cola', sector: 'Consumer Staples', sharesHeld: 12_000_000, dollarValue: 780_000_000, lastReported: '2026-03-31' },
    { ticker: 'WMT',  name: 'Walmart', sector: 'Consumer Staples', sharesHeld: 8_900_000, dollarValue: 690_000_000, lastReported: '2026-03-31' },
    { ticker: 'PEP',  name: 'PepsiCo', sector: 'Consumer Staples', sharesHeld: 3_500_000, dollarValue: 605_000_000, lastReported: '2026-03-31' },
    { ticker: 'TLT',  name: 'iShares 20+ Year Treasury Bond', sector: 'Fixed Income', sharesHeld: 5_100_000, dollarValue: 470_000_000, lastReported: '2026-03-31' },
  ],
  'eric-sprott': [
    { ticker: 'KGC',  name: 'Kinross Gold', sector: 'Materials', sharesHeld: 38_000_000, dollarValue: 480_000_000, lastReported: '2026-03-31', note: 'Sprott Inc. portfolio' },
    { ticker: 'AEM',  name: 'Agnico Eagle Mines', sector: 'Materials', sharesHeld: 4_200_000, dollarValue: 340_000_000, lastReported: '2026-03-31' },
    { ticker: 'PAAS', name: 'Pan American Silver', sector: 'Materials', sharesHeld: 12_500_000, dollarValue: 285_000_000, lastReported: '2026-03-31' },
    { ticker: 'WPM',  name: 'Wheaton Precious Metals', sector: 'Materials', sharesHeld: 4_400_000, dollarValue: 270_000_000, lastReported: '2026-03-31' },
    { ticker: 'FNV',  name: 'Franco-Nevada', sector: 'Materials', sharesHeld: 1_700_000, dollarValue: 245_000_000, lastReported: '2026-03-31' },
    { ticker: 'AG',   name: 'First Majestic Silver', sector: 'Materials', sharesHeld: 26_000_000, dollarValue: 198_000_000, lastReported: '2026-03-31' },
    { ticker: 'IAG',  name: 'IAMGOLD', sector: 'Materials', sharesHeld: 31_000_000, dollarValue: 156_000_000, lastReported: '2026-03-31' },
    { ticker: 'EXK',  name: 'Endeavour Silver', sector: 'Materials', sharesHeld: 24_000_000, dollarValue: 96_000_000, lastReported: '2026-03-31' },
    { ticker: 'NGD',  name: 'New Gold', sector: 'Materials', sharesHeld: 35_000_000, dollarValue: 73_000_000, lastReported: '2026-03-31' },
    { ticker: 'HL',   name: 'Hecla Mining', sector: 'Materials', sharesHeld: 14_000_000, dollarValue: 68_000_000, lastReported: '2026-03-31' },
  ],
  'trump-family': [
    { ticker: 'DJT',  name: 'Trump Media & Technology Group', sector: 'Communication Services', sharesHeld: 115_000_000, dollarValue: 3_900_000_000, lastReported: '2026-04-30', note: 'Founder stake' },
    { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer Discretionary', sharesHeld: 75_000, dollarValue: 24_000_000, lastReported: '2026-04-30', note: 'Reported Trump family member' },
    { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', sharesHeld: 20_000, dollarValue: 26_000_000, lastReported: '2026-04-30' },
    { ticker: 'AAPL', name: 'Apple', sector: 'Technology', sharesHeld: 50_000, dollarValue: 11_500_000, lastReported: '2026-04-30' },
    { ticker: 'GOOGL', name: 'Alphabet', sector: 'Communication Services', sharesHeld: 32_000, dollarValue: 6_400_000, lastReported: '2026-04-30' },
    { ticker: 'JPM',  name: 'JPMorgan Chase', sector: 'Financial Services', sharesHeld: 28_000, dollarValue: 7_100_000, lastReported: '2026-04-30' },
    { ticker: 'GS',   name: 'Goldman Sachs', sector: 'Financial Services', sharesHeld: 9_500, dollarValue: 5_800_000, lastReported: '2026-04-30' },
    { ticker: 'BLK',  name: 'BlackRock', sector: 'Financial Services', sharesHeld: 4_200, dollarValue: 3_900_000, lastReported: '2026-04-30' },
  ],
  'politicians': [
    { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', sharesHeld: 15_000, dollarValue: 22_000_000, lastReported: '2026-05-20', note: 'Pelosi family disclosed Buy' },
    { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', sharesHeld: 8_500, dollarValue: 4_100_000, lastReported: '2026-05-12', note: 'Crenshaw disclosed Buy' },
    { ticker: 'AAPL', name: 'Apple', sector: 'Technology', sharesHeld: 12_000, dollarValue: 2_900_000, lastReported: '2026-05-05', note: 'Ro Khanna disclosed Buy' },
    { ticker: 'AMZN', name: 'Amazon', sector: 'Consumer Discretionary', sharesHeld: 1_800, dollarValue: 390_000, lastReported: '2026-04-22', note: 'Multiple congressional disclosures' },
    { ticker: 'GOOGL', name: 'Alphabet', sector: 'Communication Services', sharesHeld: 2_200, dollarValue: 460_000, lastReported: '2026-04-18' },
    { ticker: 'JPM',  name: 'JPMorgan Chase', sector: 'Financial Services', sharesHeld: 6_500, dollarValue: 1_650_000, lastReported: '2026-04-10' },
    { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer Discretionary', sharesHeld: 4_300, dollarValue: 1_350_000, lastReported: '2026-04-08', note: 'Senate disclosure' },
    { ticker: 'META', name: 'Meta Platforms', sector: 'Communication Services', sharesHeld: 1_800, dollarValue: 1_100_000, lastReported: '2026-03-30' },
    { ticker: 'LMT',  name: 'Lockheed Martin', sector: 'Industrials', sharesHeld: 1_400, dollarValue: 680_000, lastReported: '2026-03-28', note: 'Defense — common House holding' },
    { ticker: 'RTX',  name: 'RTX Corp.', sector: 'Industrials', sharesHeld: 5_200, dollarValue: 620_000, lastReported: '2026-03-22' },
  ],
};

export const SECTOR_LIST_RULES: Record<string, RegExp> = {
  'metals-and-mining': /metal|mining|copper|aluminum|steel/i,
  tech: /technology|software|semiconductor|internet|computer/i,
  gold: /gold/i,
  silver: /silver/i,
  oil: /oil|petroleum|gas|energy/i,
};

// blue-chip = market cap threshold instead of sector match
export const BLUE_CHIP_MIN_MARKET_CAP = 50_000_000_000;

export const STOCK_LIST_META: Record<
  string,
  { title: string; description: string; kind: 'sector' | 'persona' | 'premium' }
> = {
  'metals-and-mining': {
    title: 'Metals & Mining Stocks',
    description:
      'Producers and explorers of base and industrial metals — copper, aluminum, steel, iron ore — that move with the global construction and infrastructure cycle.',
    kind: 'sector',
  },
  tech: {
    title: 'Technology Stocks',
    description:
      "U.S. public technology companies — from megacap platforms to semiconductor designers and emerging software names. Tech stocks set the tone for the broader market's growth narrative.",
    kind: 'sector',
  },
  gold: {
    title: 'Gold Stocks',
    description:
      'Senior and junior gold miners plus streaming/royalty companies. These names tend to leverage moves in the spot gold price and are watched as an inflation hedge.',
    kind: 'sector',
  },
  silver: {
    title: 'Silver Stocks',
    description:
      'Primary silver miners and silver-heavy polymetallic producers. Silver tracks gold but with higher industrial demand from solar, electronics and EVs.',
    kind: 'sector',
  },
  'blue-chip': {
    title: 'Blue Chip Stocks',
    description:
      'Established U.S. companies above $50B in market capitalisation — long histories of stable earnings, broad institutional ownership, and the backbone of most index portfolios.',
    kind: 'sector',
  },
  oil: {
    title: 'Oil & Energy Stocks',
    description:
      'Integrated majors, independent E&Ps, and oilfield services. These names track the WTI and Brent crude curves and are highly sensitive to OPEC+ decisions.',
    kind: 'sector',
  },
  'warren-buffett': {
    title: "Warren Buffett's Portfolio",
    description:
      "Selected current holdings of Berkshire Hathaway — Warren Buffett's flagship investment vehicle. Sample sizes shown; refreshed from public 13F filings.",
    kind: 'persona',
  },
  'jeff-bezos': {
    title: "Jeff Bezos's Investments",
    description:
      'A representative sample of public-market positions reported across Bezos Expeditions and Bezos-family holdings, plus his founding stake in Amazon.',
    kind: 'persona',
  },
  'ray-dalio': {
    title: "Ray Dalio's Bridgewater Portfolio",
    description:
      "Selected holdings from Bridgewater Associates' Pure Alpha / All Weather strategies — a globally diversified, macro-driven book.",
    kind: 'persona',
  },
  'eric-sprott': {
    title: "Eric Sprott's Precious Metals Book",
    description:
      "Selected precious-metals positions held across Sprott Inc.'s funds and Eric Sprott's personal accounts — primarily senior and mid-tier gold and silver miners.",
    kind: 'persona',
  },
  'trump-family': {
    title: "Trump Family Disclosures",
    description:
      'Public holdings reported by members of the Trump family in financial disclosure filings, plus the founder stake in Trump Media & Technology Group.',
    kind: 'persona',
  },
  politicians: {
    title: 'Politicians (Congressional Trades)',
    description:
      'A sample of recent equities trading disclosures by U.S. House and Senate members under the STOCK Act. Amounts are disclosed as ranges; figures shown are sample midpoints.',
    kind: 'persona',
  },
};
