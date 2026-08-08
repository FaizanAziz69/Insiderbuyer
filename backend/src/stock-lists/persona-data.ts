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
    { ticker: 'CB',   name: 'Chubb Limited', sector: 'Financial Services', sharesHeld: 27_000_000, dollarValue: 7_700_000_000, lastReported: '2026-03-31' },
    { ticker: 'VRSN', name: 'VeriSign', sector: 'Technology', sharesHeld: 13_300_000, dollarValue: 3_500_000_000, lastReported: '2026-03-31' },
    { ticker: 'KR',   name: 'Kroger', sector: 'Consumer Staples', sharesHeld: 50_000_000, dollarValue: 3_100_000_000, lastReported: '2026-03-31' },
    { ticker: 'SIRI', name: 'Sirius XM Holdings', sector: 'Communication Services', sharesHeld: 119_000_000, dollarValue: 2_700_000_000, lastReported: '2026-03-31' },
    { ticker: 'AMZN', name: 'Amazon.com', sector: 'Consumer Discretionary', sharesHeld: 10_000_000, dollarValue: 2_300_000_000, lastReported: '2026-03-31' },
    { ticker: 'COF',  name: 'Capital One Financial', sector: 'Financial Services', sharesHeld: 9_100_000, dollarValue: 1_700_000_000, lastReported: '2026-03-31' },
    { ticker: 'AON',  name: 'Aon plc', sector: 'Financial Services', sharesHeld: 4_100_000, dollarValue: 1_500_000_000, lastReported: '2026-03-31' },
    { ticker: 'NU',   name: 'Nu Holdings', sector: 'Financial Services', sharesHeld: 107_000_000, dollarValue: 1_400_000_000, lastReported: '2026-03-31' },
    { ticker: 'TMUS', name: 'T-Mobile US', sector: 'Communication Services', sharesHeld: 4_700_000, dollarValue: 1_100_000_000, lastReported: '2026-03-31' },
    { ticker: 'ALLY', name: 'Ally Financial', sector: 'Financial Services', sharesHeld: 29_000_000, dollarValue: 1_100_000_000, lastReported: '2026-03-31' },
    { ticker: 'DPZ',  name: "Domino's Pizza", sector: 'Consumer Discretionary', sharesHeld: 2_400_000, dollarValue: 1_100_000_000, lastReported: '2026-03-31' },
    { ticker: 'LPX',  name: 'Louisiana-Pacific', sector: 'Materials', sharesHeld: 5_700_000, dollarValue: 540_000_000, lastReported: '2026-03-31' },
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
    { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', sharesHeld: 850_000, dollarValue: 435_000_000, lastReported: '2026-03-31' },
    { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', sharesHeld: 2_300_000, dollarValue: 405_000_000, lastReported: '2026-03-31' },
    { ticker: 'GOOGL', name: 'Alphabet (Class A)', sector: 'Communication Services', sharesHeld: 1_900_000, dollarValue: 372_000_000, lastReported: '2026-03-31' },
    { ticker: 'META', name: 'Meta Platforms', sector: 'Communication Services', sharesHeld: 480_000, dollarValue: 345_000_000, lastReported: '2026-03-31' },
    { ticker: 'AAPL', name: 'Apple', sector: 'Technology', sharesHeld: 1_100_000, dollarValue: 320_000_000, lastReported: '2026-03-31' },
    { ticker: 'AVGO', name: 'Broadcom', sector: 'Technology', sharesHeld: 1_200_000, dollarValue: 302_000_000, lastReported: '2026-03-31' },
    { ticker: 'COST', name: 'Costco Wholesale', sector: 'Consumer Staples', sharesHeld: 290_000, dollarValue: 285_000_000, lastReported: '2026-03-31' },
    { ticker: 'MCD',  name: "McDonald's", sector: 'Consumer Discretionary', sharesHeld: 880_000, dollarValue: 268_000_000, lastReported: '2026-03-31' },
    { ticker: 'CVS',  name: 'CVS Health', sector: 'Healthcare', sharesHeld: 3_900_000, dollarValue: 253_000_000, lastReported: '2026-03-31' },
    { ticker: 'UNH',  name: 'UnitedHealth Group', sector: 'Healthcare', sharesHeld: 460_000, dollarValue: 244_000_000, lastReported: '2026-03-31' },
    { ticker: 'JPM',  name: 'JPMorgan Chase', sector: 'Financial Services', sharesHeld: 870_000, dollarValue: 231_000_000, lastReported: '2026-03-31' },
    { ticker: 'V',    name: 'Visa Inc.', sector: 'Financial Services', sharesHeld: 640_000, dollarValue: 215_000_000, lastReported: '2026-03-31' },
    { ticker: 'MA',   name: 'Mastercard', sector: 'Financial Services', sharesHeld: 360_000, dollarValue: 202_000_000, lastReported: '2026-03-31' },
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
    { ticker: 'NEM',  name: 'Newmont Corp.', sector: 'Materials', sharesHeld: 1_900_000, dollarValue: 111_000_000, lastReported: '2026-03-31' },
    { ticker: 'GOLD', name: 'Barrick Gold', sector: 'Materials', sharesHeld: 4_800_000, dollarValue: 102_000_000, lastReported: '2026-03-31' },
    { ticker: 'BTG',  name: 'B2Gold', sector: 'Materials', sharesHeld: 27_000_000, dollarValue: 89_000_000, lastReported: '2026-03-31' },
    { ticker: 'SSRM', name: 'SSR Mining', sector: 'Materials', sharesHeld: 7_200_000, dollarValue: 81_000_000, lastReported: '2026-03-31' },
    { ticker: 'CDE',  name: 'Coeur Mining', sector: 'Materials', sharesHeld: 10_500_000, dollarValue: 75_000_000, lastReported: '2026-03-31' },
    { ticker: 'MAG',  name: 'MAG Silver', sector: 'Materials', sharesHeld: 4_900_000, dollarValue: 70_000_000, lastReported: '2026-03-31' },
    { ticker: 'SVM',  name: 'Silvercorp Metals', sector: 'Materials', sharesHeld: 14_800_000, dollarValue: 64_000_000, lastReported: '2026-03-31' },
    { ticker: 'ASM',  name: 'Avino Silver & Gold', sector: 'Materials', sharesHeld: 30_000_000, dollarValue: 57_000_000, lastReported: '2026-03-31' },
    { ticker: 'GATO', name: 'Gatos Silver', sector: 'Materials', sharesHeld: 3_100_000, dollarValue: 53_000_000, lastReported: '2026-03-31' },
    { ticker: 'SILV', name: 'SilverCrest Metals', sector: 'Materials', sharesHeld: 12_500_000, dollarValue: 49_000_000, lastReported: '2026-03-31' },
    { ticker: 'FSM',  name: 'Fortuna Mining', sector: 'Materials', sharesHeld: 7_600_000, dollarValue: 45_000_000, lastReported: '2026-03-31' },
    { ticker: 'EQX',  name: 'Equinox Gold', sector: 'Materials', sharesHeld: 5_800_000, dollarValue: 42_000_000, lastReported: '2026-03-31' },
    { ticker: 'SAND', name: 'Sandstorm Gold', sector: 'Materials', sharesHeld: 5_500_000, dollarValue: 38_000_000, lastReported: '2026-03-31' },
    { ticker: 'DRD',  name: 'DRDGOLD', sector: 'Materials', sharesHeld: 2_400_000, dollarValue: 35_000_000, lastReported: '2026-03-31' },
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
    { ticker: 'PANW', name: 'Palo Alto Networks', sector: 'Technology', sharesHeld: 3_100, dollarValue: 610_000, lastReported: '2026-05-18', note: 'House disclosure — cybersecurity' },
    { ticker: 'AVGO', name: 'Broadcom', sector: 'Technology', sharesHeld: 2_300, dollarValue: 580_000, lastReported: '2026-05-14' },
    { ticker: 'CRM',  name: 'Salesforce', sector: 'Technology', sharesHeld: 1_900, dollarValue: 535_000, lastReported: '2026-05-08' },
    { ticker: 'MU',   name: 'Micron Technology', sector: 'Technology', sharesHeld: 4_100, dollarValue: 518_000, lastReported: '2026-05-02', note: 'Semiconductor — CHIPS Act adjacent' },
    { ticker: 'AMD',  name: 'Advanced Micro Devices', sector: 'Technology', sharesHeld: 2_800, dollarValue: 493_000, lastReported: '2026-04-28' },
    { ticker: 'DIS',  name: 'Walt Disney', sector: 'Communication Services', sharesHeld: 4_200, dollarValue: 473_000, lastReported: '2026-04-24' },
    { ticker: 'V',    name: 'Visa Inc.', sector: 'Financial Services', sharesHeld: 1_350, dollarValue: 454_000, lastReported: '2026-04-20' },
    { ticker: 'MA',   name: 'Mastercard', sector: 'Financial Services', sharesHeld: 780, dollarValue: 439_000, lastReported: '2026-04-16' },
    { ticker: 'UNH',  name: 'UnitedHealth Group', sector: 'Healthcare', sharesHeld: 800, dollarValue: 425_000, lastReported: '2026-04-12' },
    { ticker: 'COST', name: 'Costco Wholesale', sector: 'Consumer Staples', sharesHeld: 420, dollarValue: 412_000, lastReported: '2026-04-08' },
    { ticker: 'NFLX', name: 'Netflix', sector: 'Communication Services', sharesHeld: 340, dollarValue: 405_000, lastReported: '2026-04-04', note: 'Senate disclosure' },
    { ticker: 'BA',   name: 'Boeing', sector: 'Industrials', sharesHeld: 2_100, dollarValue: 391_000, lastReported: '2026-03-30' },
    { ticker: 'GD',   name: 'General Dynamics', sector: 'Industrials', sharesHeld: 1_280, dollarValue: 379_000, lastReported: '2026-03-26', note: 'Defense — common House holding' },
    { ticker: 'NOC',  name: 'Northrop Grumman', sector: 'Industrials', sharesHeld: 760, dollarValue: 369_000, lastReported: '2026-03-20' },
    { ticker: 'XOM',  name: 'Exxon Mobil', sector: 'Energy', sharesHeld: 3_100, dollarValue: 360_000, lastReported: '2026-03-16' },
  ],
};

// Curated ticker universes per sector list — used to top-up sector lists so
// every table shows at least ~20 well-known names even when our SEC Form 4
// company table only has a handful of matches. Name / sector / market cap
// resolve from the market-stats reference quote table at read time.
export const SECTOR_UNIVERSE: Record<string, string[]> = {
  biotech: [
    'LLY', 'PFE', 'MRK', 'ABBV', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN',
    'MRNA', 'BIIB', 'VKTX', 'CRSP', 'NTLA', 'NVO', 'AZN', 'NVS', 'JNJ',
    'SNY', 'GSK', 'ALNY', 'BNTX', 'SRPT', 'RARE', 'BEAM', 'RXRX', 'TEM',
    'HIMS', 'EXAS', 'NBIX',
  ],
  'metals-and-mining': [
    'BHP', 'RIO', 'VALE', 'FCX', 'SCCO', 'NUE', 'STLD', 'CLF', 'X', 'AA',
    'CENX', 'MP', 'ALB', 'SQM', 'TECK', 'HBM', 'ERO', 'CMC', 'RS', 'ATI',
    'MT', 'GGB', 'SID', 'NEM', 'AEM', 'B', 'IVN', 'LUN', 'CS', 'FM',
    'UEC', 'CCJ', 'DNN', 'UUUU', 'LAC', 'PLL', 'TMC', 'NB',
  ],
  tech: [
    'AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'CSCO', 'IBM',
    'QCOM', 'TXN', 'INTU', 'NOW', 'PANW', 'SNOW', 'PLTR', 'CRWD', 'MU', 'AMAT',
    'LRCX', 'KLAC', 'ADI', 'INTC', 'SMCI', 'ANET', 'DELL', 'HPQ',
    'ARM', 'MRVL', 'ON', 'NXPI', 'MCHP', 'CDNS', 'SNPS', 'FTNT', 'ZS', 'DDOG',
    'NET', 'MDB', 'TEAM', 'WDAY', 'SHOP', 'SQ', 'UBER', 'ABNB', 'TTD', 'APP',
  ],
  gold: [
    'NEM', 'GOLD', 'AEM', 'KGC', 'FNV', 'WPM', 'RGLD', 'AU', 'GFI', 'HMY',
    'EGO', 'BTG', 'AGI', 'OR', 'SSRM', 'CDE', 'IAG', 'NGD', 'SAND', 'EQX',
    'DRD', 'NG', 'GORO', 'USAU', 'AUY', 'PAAS', 'SA',
    'GAU', 'THM', 'VGZ', 'AUMN',
  ],
  silver: [
    'PAAS', 'AG', 'HL', 'EXK', 'FSM', 'MAG', 'SVM', 'ASM', 'GATO', 'SILV',
    'USAS', 'BVN', 'WPM', 'SSRM', 'CDE', 'SLV', 'SIVR', 'PSLV', 'SIL', 'SILJ',
    'AYA', 'GPL', 'AXU', 'HYMC', 'ABRA',
  ],
  oil: [
    'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'PSX', 'VLO', 'MPC', 'HES',
    'WMB', 'KMI', 'OKE', 'HAL', 'BKR', 'DVN', 'FANG', 'CTRA', 'APA', 'EQT',
    'AR', 'RRC', 'PR', 'SM', 'MUR', 'NOG', 'CHRD', 'LNG', 'TRGP', 'ET',
    'EPD', 'MPLX', 'PAA', 'WES', 'AM', 'DINO', 'PBF', 'CVI', 'VNOM', 'CRC',
  ],
  'blue-chip': [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'BRK-B', 'JPM',
    'V', 'MA', 'UNH', 'XOM', 'JNJ', 'WMT', 'PG', 'HD', 'COST', 'ORCL',
    'LLY', 'ABBV', 'BAC', 'KO', 'PEP', 'MRK', 'CVX', 'CRM', 'ADBE', 'NFLX',
    'MCD', 'DIS',
  ],
};

export const SECTOR_LIST_RULES: Record<string, RegExp> = {
  'metals-and-mining': /metal|mining|copper|aluminum|steel/i,
  biotech: /biotech|pharma|life science|drug|biologic|therapeut|medicinal|diagnostic|genom|oncolog|vaccine|laborator|surgical/i,
  tech: /information technology|software|semiconductor|internet|computer|consumer electronics|it services|technology hardware/i,
  gold: /gold/i,
  silver: /silver/i,
  oil: /oil|petroleum|gas|energy/i,
};

// blue-chip = market cap threshold instead of sector match
export const BLUE_CHIP_MIN_MARKET_CAP = 50_000_000_000;

// ── Multi-exchange country universes ──────────────────────────────────────
// Major listed names per exchange. Live prices come from the quote feed
// (Yahoo supports the .TO / .DE suffixes). These are stock-coverage lists —
// insider data for these exchanges (SEDI/BaFin) is a separate feed, so they
// carry live quotes but no Insider Score yet.
export interface CountryStock {
  ticker: string;
  name: string;
  sector: string;
}

export const COUNTRY_UNIVERSE: Record<string, CountryStock[]> = {
  canada: [
    { ticker: 'RY.TO', name: 'Royal Bank of Canada', sector: 'Financial Services' },
    { ticker: 'TD.TO', name: 'Toronto-Dominion Bank', sector: 'Financial Services' },
    { ticker: 'BNS.TO', name: 'Bank of Nova Scotia', sector: 'Financial Services' },
    { ticker: 'BMO.TO', name: 'Bank of Montreal', sector: 'Financial Services' },
    { ticker: 'CM.TO', name: 'CIBC', sector: 'Financial Services' },
    { ticker: 'ENB.TO', name: 'Enbridge', sector: 'Energy' },
    { ticker: 'TRP.TO', name: 'TC Energy', sector: 'Energy' },
    { ticker: 'CNQ.TO', name: 'Canadian Natural Resources', sector: 'Energy' },
    { ticker: 'SU.TO', name: 'Suncor Energy', sector: 'Energy' },
    { ticker: 'CNR.TO', name: 'Canadian National Railway', sector: 'Industrials' },
    { ticker: 'CP.TO', name: 'Canadian Pacific Kansas City', sector: 'Industrials' },
    { ticker: 'SHOP.TO', name: 'Shopify', sector: 'Technology' },
    { ticker: 'ATD.TO', name: 'Alimentation Couche-Tard', sector: 'Consumer Staples' },
    { ticker: 'BCE.TO', name: 'BCE Inc.', sector: 'Communication Services' },
    { ticker: 'T.TO', name: 'TELUS', sector: 'Communication Services' },
    { ticker: 'NTR.TO', name: 'Nutrien', sector: 'Materials' },
    { ticker: 'ABX.TO', name: 'Barrick Gold', sector: 'Materials — Gold' },
    { ticker: 'AEM.TO', name: 'Agnico Eagle Mines', sector: 'Materials — Gold' },
    { ticker: 'MFC.TO', name: 'Manulife Financial', sector: 'Financial Services' },
    { ticker: 'BAM.TO', name: 'Brookfield Asset Management', sector: 'Financial Services' },
  ],
  germany: [
    { ticker: 'SAP.DE', name: 'SAP SE', sector: 'Technology' },
    { ticker: 'SIE.DE', name: 'Siemens AG', sector: 'Industrials' },
    { ticker: 'ALV.DE', name: 'Allianz SE', sector: 'Financial Services' },
    { ticker: 'DTE.DE', name: 'Deutsche Telekom', sector: 'Communication Services' },
    { ticker: 'MBG.DE', name: 'Mercedes-Benz Group', sector: 'Consumer Discretionary' },
    { ticker: 'BMW.DE', name: 'BMW AG', sector: 'Consumer Discretionary' },
    { ticker: 'VOW3.DE', name: 'Volkswagen (pref)', sector: 'Consumer Discretionary' },
    { ticker: 'BAS.DE', name: 'BASF SE', sector: 'Materials' },
    { ticker: 'BAYN.DE', name: 'Bayer AG', sector: 'Healthcare' },
    { ticker: 'DBK.DE', name: 'Deutsche Bank', sector: 'Financial Services' },
    { ticker: 'IFX.DE', name: 'Infineon Technologies', sector: 'Technology' },
    { ticker: 'ADS.DE', name: 'adidas AG', sector: 'Consumer Discretionary' },
    { ticker: 'DHL.DE', name: 'DHL Group', sector: 'Industrials' },
    { ticker: 'MUV2.DE', name: 'Munich Re', sector: 'Financial Services' },
    { ticker: 'RWE.DE', name: 'RWE AG', sector: 'Utilities' },
    { ticker: 'EOAN.DE', name: 'E.ON SE', sector: 'Utilities' },
    { ticker: 'MRK.DE', name: 'Merck KGaA', sector: 'Healthcare' },
    { ticker: 'DB1.DE', name: 'Deutsche Börse', sector: 'Financial Services' },
    { ticker: 'AIR.DE', name: 'Airbus SE', sector: 'Industrials' },
    { ticker: 'P911.DE', name: 'Porsche AG', sector: 'Consumer Discretionary' },
  ],
};

// ── Market-cap & thematic universes ───────────────────────────────────────
// Curated baskets of well-known U.S. names with LIVE prices/market cap. Unlike
// the sector lists (which filter our insider-buy universe and therefore skew to
// small/micro-caps), these always render real constituents. Insider Score is attached
// where the name also appears in our Form 4 rankings.
export const UNIVERSE_LISTS: Record<string, CountryStock[]> = {
  'large-cap': [
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology' },
    { ticker: 'AMZN', name: 'Amazon.com', sector: 'Consumer Discretionary' },
    { ticker: 'GOOGL', name: 'Alphabet (Class A)', sector: 'Communication Services' },
    { ticker: 'GOOG', name: 'Alphabet (Class C)', sector: 'Communication Services' },
    { ticker: 'META', name: 'Meta Platforms', sector: 'Communication Services' },
    { ticker: 'BRK-B', name: 'Berkshire Hathaway', sector: 'Financial Services' },
    { ticker: 'LLY', name: 'Eli Lilly', sector: 'Healthcare' },
    { ticker: 'AVGO', name: 'Broadcom', sector: 'Technology' },
    { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer Discretionary' },
    { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services' },
    { ticker: 'V', name: 'Visa Inc.', sector: 'Financial Services' },
    { ticker: 'WMT', name: 'Walmart', sector: 'Consumer Staples' },
    { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
    { ticker: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare' },
    { ticker: 'MA', name: 'Mastercard', sector: 'Financial Services' },
    { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
    { ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples' },
    { ticker: 'HD', name: 'Home Depot', sector: 'Consumer Discretionary' },
    { ticker: 'COST', name: 'Costco Wholesale', sector: 'Consumer Staples' },
    { ticker: 'ORCL', name: 'Oracle Corp.', sector: 'Technology' },
    { ticker: 'ABBV', name: 'AbbVie', sector: 'Healthcare' },
    { ticker: 'CVX', name: 'Chevron', sector: 'Energy' },
    { ticker: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples' },
    { ticker: 'PEP', name: 'PepsiCo', sector: 'Consumer Staples' },
    { ticker: 'BAC', name: 'Bank of America', sector: 'Financial Services' },
    { ticker: 'MRK', name: 'Merck & Co.', sector: 'Healthcare' },
    { ticker: 'CRM', name: 'Salesforce', sector: 'Technology' },
    { ticker: 'ACN', name: 'Accenture', sector: 'Technology' },
    { ticker: 'MCD', name: "McDonald's", sector: 'Consumer Discretionary' },
    { ticker: 'NFLX', name: 'Netflix', sector: 'Communication Services' },
    { ticker: 'ADBE', name: 'Adobe', sector: 'Technology' },
    { ticker: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Healthcare' },
    { ticker: 'LIN', name: 'Linde plc', sector: 'Materials' },
    { ticker: 'CSCO', name: 'Cisco Systems', sector: 'Technology' },
    { ticker: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare' },
    { ticker: 'DIS', name: 'Walt Disney', sector: 'Communication Services' },
    { ticker: 'WFC', name: 'Wells Fargo', sector: 'Financial Services' },
    { ticker: 'INTU', name: 'Intuit', sector: 'Technology' },
    { ticker: 'QCOM', name: 'Qualcomm', sector: 'Technology' },
    { ticker: 'TXN', name: 'Texas Instruments', sector: 'Technology' },
    { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology' },
    { ticker: 'IBM', name: 'IBM', sector: 'Technology' },
    { ticker: 'GE', name: 'GE Aerospace', sector: 'Industrials' },
    { ticker: 'CAT', name: 'Caterpillar', sector: 'Industrials' },
    { ticker: 'VZ', name: 'Verizon', sector: 'Communication Services' },
    { ticker: 'PM', name: 'Philip Morris Intl.', sector: 'Consumer Staples' },
    { ticker: 'DHR', name: 'Danaher', sector: 'Healthcare' },
    { ticker: 'NOW', name: 'ServiceNow', sector: 'Technology' },
    { ticker: 'AMGN', name: 'Amgen', sector: 'Healthcare' },
    { ticker: 'UNP', name: 'Union Pacific', sector: 'Industrials' },
    { ticker: 'SPGI', name: 'S&P Global', sector: 'Financial Services' },
    { ticker: 'GS', name: 'Goldman Sachs', sector: 'Financial Services' },
    { ticker: 'ISRG', name: 'Intuitive Surgical', sector: 'Healthcare' },
    { ticker: 'NEE', name: 'NextEra Energy', sector: 'Utilities' },
    { ticker: 'RTX', name: 'RTX Corp.', sector: 'Industrials' },
    { ticker: 'HON', name: 'Honeywell', sector: 'Industrials' },
    { ticker: 'PFE', name: 'Pfizer', sector: 'Healthcare' },
    { ticker: 'LOW', name: "Lowe's", sector: 'Consumer Discretionary' },
    { ticker: 'BKNG', name: 'Booking Holdings', sector: 'Consumer Discretionary' },
    { ticker: 'T', name: 'AT&T', sector: 'Communication Services' },
  ],
  'blue-chip': [
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
    { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services' },
    { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
    { ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples' },
    { ticker: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples' },
    { ticker: 'PEP', name: 'PepsiCo', sector: 'Consumer Staples' },
    { ticker: 'WMT', name: 'Walmart', sector: 'Consumer Staples' },
    { ticker: 'HD', name: 'Home Depot', sector: 'Consumer Discretionary' },
    { ticker: 'V', name: 'Visa Inc.', sector: 'Financial Services' },
    { ticker: 'MA', name: 'Mastercard', sector: 'Financial Services' },
    { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
    { ticker: 'CVX', name: 'Chevron', sector: 'Energy' },
    { ticker: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare' },
    { ticker: 'DIS', name: 'Walt Disney', sector: 'Communication Services' },
    { ticker: 'MCD', name: "McDonald's", sector: 'Consumer Discretionary' },
    { ticker: 'CAT', name: 'Caterpillar', sector: 'Industrials' },
    { ticker: 'BA', name: 'Boeing', sector: 'Industrials' },
    { ticker: 'IBM', name: 'IBM', sector: 'Technology' },
    { ticker: 'GE', name: 'GE Aerospace', sector: 'Industrials' },
    { ticker: 'MMM', name: '3M Company', sector: 'Industrials' },
    { ticker: 'AXP', name: 'American Express', sector: 'Financial Services' },
    { ticker: 'TRV', name: 'Travelers', sector: 'Financial Services' },
    { ticker: 'NKE', name: 'Nike', sector: 'Consumer Discretionary' },
    { ticker: 'MRK', name: 'Merck & Co.', sector: 'Healthcare' },
    { ticker: 'HON', name: 'Honeywell', sector: 'Industrials' },
    { ticker: 'LOW', name: "Lowe's", sector: 'Consumer Discretionary' },
    { ticker: 'AMGN', name: 'Amgen', sector: 'Healthcare' },
    { ticker: 'GS', name: 'Goldman Sachs', sector: 'Financial Services' },
    { ticker: 'CSCO', name: 'Cisco Systems', sector: 'Technology' },
    { ticker: 'VZ', name: 'Verizon', sector: 'Communication Services' },
    { ticker: 'WFC', name: 'Wells Fargo', sector: 'Financial Services' },
    { ticker: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare' },
    { ticker: 'TXN', name: 'Texas Instruments', sector: 'Technology' },
    { ticker: 'LMT', name: 'Lockheed Martin', sector: 'Industrials' },
  ],
  faang: [
    { ticker: 'META', name: 'Meta Platforms', sector: 'Communication Services' },
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { ticker: 'AMZN', name: 'Amazon.com', sector: 'Consumer Discretionary' },
    { ticker: 'NFLX', name: 'Netflix', sector: 'Communication Services' },
    { ticker: 'GOOGL', name: 'Alphabet (Class A)', sector: 'Communication Services' },
    { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology' },
    { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer Discretionary' },
  ],
  reits: [
    { ticker: 'O', name: 'Realty Income', sector: 'Real Estate' },
    { ticker: 'PLD', name: 'Prologis', sector: 'Real Estate' },
    { ticker: 'AMT', name: 'American Tower', sector: 'Real Estate' },
    { ticker: 'EQIX', name: 'Equinix', sector: 'Real Estate' },
    { ticker: 'SPG', name: 'Simon Property Group', sector: 'Real Estate' },
    { ticker: 'PSA', name: 'Public Storage', sector: 'Real Estate' },
    { ticker: 'WELL', name: 'Welltower', sector: 'Real Estate' },
    { ticker: 'DLR', name: 'Digital Realty Trust', sector: 'Real Estate' },
    { ticker: 'VICI', name: 'VICI Properties', sector: 'Real Estate' },
    { ticker: 'CCI', name: 'Crown Castle', sector: 'Real Estate' },
    { ticker: 'EXR', name: 'Extra Space Storage', sector: 'Real Estate' },
    { ticker: 'AVB', name: 'AvalonBay Communities', sector: 'Real Estate' },
    { ticker: 'EQR', name: 'Equity Residential', sector: 'Real Estate' },
    { ticker: 'SBAC', name: 'SBA Communications', sector: 'Real Estate' },
    { ticker: 'ARE', name: 'Alexandria Real Estate', sector: 'Real Estate' },
    { ticker: 'VTR', name: 'Ventas', sector: 'Real Estate' },
    { ticker: 'IRM', name: 'Iron Mountain', sector: 'Real Estate' },
    { ticker: 'INVH', name: 'Invitation Homes', sector: 'Real Estate' },
    { ticker: 'MAA', name: 'Mid-America Apartment', sector: 'Real Estate' },
    { ticker: 'ESS', name: 'Essex Property Trust', sector: 'Real Estate' },
    { ticker: 'KIM', name: 'Kimco Realty', sector: 'Real Estate' },
    { ticker: 'HST', name: 'Host Hotels & Resorts', sector: 'Real Estate' },
    { ticker: 'DOC', name: 'Healthpeak Properties', sector: 'Real Estate' },
  ],
  'small-cap': [
    { ticker: 'ASTS', name: 'AST SpaceMobile', sector: 'Communication Services' },
    { ticker: 'IONQ', name: 'IonQ', sector: 'Technology' },
    { ticker: 'RKLB', name: 'Rocket Lab', sector: 'Industrials' },
    { ticker: 'ACHR', name: 'Archer Aviation', sector: 'Industrials' },
    { ticker: 'JOBY', name: 'Joby Aviation', sector: 'Industrials' },
    { ticker: 'SOUN', name: 'SoundHound AI', sector: 'Technology' },
    { ticker: 'BBAI', name: 'BigBear.ai', sector: 'Technology' },
    { ticker: 'RXRX', name: 'Recursion Pharmaceuticals', sector: 'Healthcare' },
    { ticker: 'LUNR', name: 'Intuitive Machines', sector: 'Industrials' },
    { ticker: 'RGTI', name: 'Rigetti Computing', sector: 'Technology' },
    { ticker: 'OKLO', name: 'Oklo Inc.', sector: 'Utilities' },
    { ticker: 'SMR', name: 'NuScale Power', sector: 'Utilities' },
    { ticker: 'DNA', name: 'Ginkgo Bioworks', sector: 'Healthcare' },
    { ticker: 'CIFR', name: 'Cipher Mining', sector: 'Financial Services' },
    { ticker: 'AUR', name: 'Aurora Innovation', sector: 'Technology' },
    { ticker: 'QS', name: 'QuantumScape', sector: 'Consumer Discretionary' },
    { ticker: 'LAZR', name: 'Luminar Technologies', sector: 'Technology' },
    { ticker: 'AI', name: 'C3.ai', sector: 'Technology' },
    { ticker: 'RUN', name: 'Sunrun', sector: 'Utilities' },
    { ticker: 'EVGO', name: 'EVgo', sector: 'Utilities' },
    { ticker: 'KTOS', name: 'Kratos Defense', sector: 'Industrials' },
    { ticker: 'RDW', name: 'Redwire', sector: 'Industrials' },
    { ticker: 'DNMR', name: 'Danimer Scientific', sector: 'Materials' },
    { ticker: 'VLD', name: 'Velo3D', sector: 'Technology' },
    { ticker: 'MVIS', name: 'MicroVision', sector: 'Technology' },
    { ticker: 'BLNK', name: 'Blink Charging', sector: 'Industrials' },
  ],
  'penny-stocks': [
    { ticker: 'SNDL', name: 'SNDL Inc.', sector: 'Consumer Staples' },
    { ticker: 'PLUG', name: 'Plug Power', sector: 'Industrials' },
    { ticker: 'GSAT', name: 'Globalstar', sector: 'Communication Services' },
    { ticker: 'FUBO', name: 'fuboTV', sector: 'Communication Services' },
    { ticker: 'CHPT', name: 'ChargePoint', sector: 'Industrials' },
    { ticker: 'RIG', name: 'Transocean', sector: 'Energy' },
    { ticker: 'NIO', name: 'NIO Inc.', sector: 'Consumer Discretionary' },
    { ticker: 'BBAI', name: 'BigBear.ai', sector: 'Technology' },
    { ticker: 'WULF', name: 'TeraWulf', sector: 'Financial Services' },
    { ticker: 'GERN', name: 'Geron Corp.', sector: 'Healthcare' },
    { ticker: 'KOS', name: 'Kosmos Energy', sector: 'Energy' },
    { ticker: 'AGEN', name: 'Agenus', sector: 'Healthcare' },
    { ticker: 'CLNE', name: 'Clean Energy Fuels', sector: 'Energy' },
    { ticker: 'DNN', name: 'Denison Mines', sector: 'Energy' },
    { ticker: 'UUUU', name: 'Energy Fuels', sector: 'Energy' },
    { ticker: 'NOK', name: 'Nokia', sector: 'Technology' },
    { ticker: 'AMC', name: 'AMC Entertainment', sector: 'Communication Services' },
    { ticker: 'VTGN', name: 'VistaGen Therapeutics', sector: 'Healthcare' },
    { ticker: 'GEVO', name: 'Gevo', sector: 'Energy' },
    { ticker: 'BITF', name: 'Bitfarms', sector: 'Financial Services' },
    { ticker: 'HUT', name: 'Hut 8 Mining', sector: 'Financial Services' },
    { ticker: 'OCGN', name: 'Ocugen', sector: 'Healthcare' },
    { ticker: 'SENS', name: 'Senseonics', sector: 'Healthcare' },
    { ticker: 'INDI', name: 'indie Semiconductor', sector: 'Technology' },
    { ticker: 'LODE', name: 'Comstock Inc.', sector: 'Materials' },
    { ticker: 'CTXR', name: 'Citius Pharmaceuticals', sector: 'Healthcare' },
  ],
};

export const STOCK_LIST_META: Record<
  string,
  {
    title: string;
    description: string;
    kind: 'sector' | 'persona' | 'premium' | 'country' | 'universe';
  }
> = {
  'large-cap': {
    title: 'Large Cap Stocks',
    description:
      'The biggest U.S. companies by market capitalisation — the mega-cap leaders that anchor the S&P 500 and drive index returns, with live prices and fundamentals.',
    kind: 'universe',
  },
  'small-cap': {
    title: 'Small Cap Stocks',
    description:
      'Smaller, faster-growing U.S. companies — higher risk and higher potential reward than the mega-caps. Live prices; insider buying often shows up here first.',
    kind: 'universe',
  },
  'penny-stocks': {
    title: 'Penny Stocks',
    description:
      'Low-priced, highly speculative U.S. stocks — big potential moves with outsized risk. Live prices and any insider-buying signal we detect. Trade with caution.',
    kind: 'universe',
  },
  faang: {
    title: 'FAANG Stocks',
    description:
      'The mega-cap technology leaders — Meta, Apple, Amazon, Netflix and Alphabet, plus Microsoft, NVIDIA and Tesla — that dominate the growth narrative.',
    kind: 'universe',
  },
  reits: {
    title: 'REIT Stocks',
    description:
      'Real Estate Investment Trusts — landlords across data centers, towers, retail, storage, healthcare and residential. Watched for their yields and rate sensitivity.',
    kind: 'universe',
  },
  canada: {
    title: 'Canadian Stocks (TSX)',
    description:
      'Major companies listed on the Toronto Stock Exchange — banks, energy, rails and materials — with live prices. Canadian insider (SEDI) coverage is being added.',
    kind: 'country',
  },
  germany: {
    title: 'German Stocks (Xetra / DAX)',
    description:
      'Leading German-listed companies on Xetra / the DAX — autos, industrials, software and chemicals — with live prices and Insider Scores derived from official BaFin directors’-dealings filings.',
    kind: 'country',
  },
  'metals-and-mining': {
    title: 'Metals & Mining Stocks',
    description:
      'Producers and explorers of base and industrial metals — copper, aluminum, steel, iron ore — that move with the global construction and infrastructure cycle.',
    kind: 'sector',
  },
  biotech: {
    title: 'Biotech Stocks',
    description:
      'Biotechnology and pharmaceutical companies — from megacap drugmakers to clinical-stage names. Insider buying in biotech often front-runs catalysts like trial readouts and FDA decisions.',
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
      'Established U.S. companies with long histories of stable earnings, broad institutional ownership, and the backbone of most index portfolios — with live prices.',
    kind: 'universe',
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
  politicians: {
    title: 'Politicians (Congressional Trades)',
    description:
      'A sample of recent equities trading disclosures by U.S. House and Senate members under the STOCK Act. Amounts are disclosed as ranges; figures shown are sample midpoints.',
    kind: 'persona',
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Hot Sectors — thematic baskets ranked by month-to-date 10%+ gainers and
// insider buying. Each basket is a hand-categorized set of liquid, U.S.-listed
// pure-plays for the theme (not GICS sectors). Tickers that don't resolve to a
// live quote are simply skipped in the computation.
// ─────────────────────────────────────────────────────────────────────────
export interface HotSectorBasket {
  key: string;
  label: string;
  tickers: string[];
}

export const HOT_SECTOR_BASKETS: HotSectorBasket[] = [
  {
    key: 'quantum',
    label: 'Quantum',
    tickers: [
      'IONQ', 'RGTI', 'QBTS', 'QUBT', 'ARQQ', 'LAES', 'QSI', 'QMCO', 'IBM',
      'GOOGL', 'MSFT', 'NVDA', 'HON', 'FORM', 'MKSI', 'COHR',
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    tickers: [
      'NVDA', 'AMD', 'PLTR', 'SMCI', 'AVGO', 'MRVL', 'MU', 'ARM', 'ANET',
      'VRT', 'SOUN', 'BBAI', 'AI', 'TEM', 'DELL', 'MSFT', 'GOOGL', 'META',
      'ORCL', 'NOW', 'SNOW', 'DDOG', 'PSTG', 'CRDO', 'ALAB', 'NBIS', 'APP',
      'IOT', 'AISP', 'INOD',
    ],
  },
  {
    key: 'gold',
    label: 'Gold',
    tickers: [
      'NEM', 'GOLD', 'AEM', 'KGC', 'AU', 'WPM', 'FNV', 'RGLD', 'GFI', 'HMY',
      'AGI', 'BTG', 'EGO', 'OR', 'SSRM', 'CDE', 'IAG', 'NGD', 'SAND', 'EQX',
      'DRD', 'HL', 'PAAS', 'AG', 'MAG', 'EXK', 'FSM', 'SA',
    ],
  },
  {
    key: 'rare-earths',
    label: 'Rare Earths & Critical Metals',
    tickers: [
      'MP', 'TMC', 'UUUU', 'NB', 'CRML', 'REE', 'MTAL', 'USAR', 'ALB', 'SQM',
      'LAC', 'PLL', 'CCJ', 'UEC', 'DNN', 'NXE', 'LEU', 'SMR', 'FCX', 'SCCO',
      'TECK', 'IVN', 'ERO', 'HBM', 'SGML', 'AREC',
    ],
  },
  {
    key: 'biotech-pharma',
    label: 'Biotech & Pharmaceuticals',
    tickers: [
      'LLY', 'PFE', 'MRK', 'ABBV', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN',
      'MRNA', 'BIIB', 'VKTX', 'CRSP', 'NTLA', 'NVO', 'AZN', 'NVS', 'JNJ',
      'SNY', 'GSK', 'ALNY', 'BNTX', 'SRPT', 'RARE', 'BEAM', 'RXRX', 'TEM',
      'HIMS', 'EXAS', 'NBIX',
    ],
  },
  {
    key: 'energy',
    label: 'Energy',
    tickers: [
      'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'MPC', 'VLO', 'OXY', 'WMB',
      'KMI', 'HAL', 'DVN', 'HES', 'FANG', 'LNG', 'OKE', 'BKR', 'CTRA', 'APA',
      'EQT', 'AR', 'TRGP', 'ET', 'EPD', 'FSLR', 'ENPH', 'NEE', 'VST', 'CEG',
    ],
  },
  {
    key: 'financials',
    label: 'Financials',
    tickers: [
      'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'V', 'MA',
      'USB', 'PNC', 'BX', 'KKR', 'COF', 'TFC', 'BK', 'STT', 'APO', 'ARES',
      'CME', 'ICE', 'SPGI', 'MCO', 'PYPL', 'SOFI', 'AFRM', 'FI', 'DFS', 'SYF',
    ],
  },
  {
    key: 'crypto',
    label: 'Crypto',
    tickers: [
      'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'HUT', 'BITF', 'CIFR', 'WULF',
      'BTBT', 'HOOD', 'IREN', 'CORZ', 'BTDR', 'GLXY', 'CRCL', 'SBET', 'DFDV',
      'BMNR', 'HIVE', 'CAN', 'SDIG',
    ],
  },
];
