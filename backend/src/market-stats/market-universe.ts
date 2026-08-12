// The universe of U.S. tickers the market-wide tool pages are built from
// (Heat Map, Analyst Ratings, Dividends, Short Interest, research-firm league
// table). Live financial data for each name is pulled at read time — this file
// only decides WHICH names appear, never their values.
//
// The universe is SCREENER-DRIVEN: every actively-traded NASDAQ/NYSE common
// stock above a $100M market cap, read from FMP's `company-screener` in one
// request and cached (client spec: "all indexed companies with a Market Cap
// over $100 Million, filtering out micro-caps under $100M"). MARKET_UNIVERSE
// below is the FALLBACK for when that call is unavailable or hasn't landed yet,
// not the definition of the universe.
//
// Measured against the production FMP key on 2026-08-13:
//   marketCapMoreThan=100000000 & exchange=NASDAQ,NYSE & isActivelyTrading=true
//     … with isEtf=false & isFund=false  → 4,311 rows, 1.85 MB, 3–10s
//     … without those two flags          → 8,577 rows, 3.69 MB, 36s
// Filtering funds AT THE SOURCE is what makes this affordable: 545 ETFs and
// 3,722 funds are half the payload and none of them belong in a stock universe.
// The response carries `sector` and `industry` inline for every row, so a
// dynamic universe also gets its sector classification for free — see
// sectorFromFmp() in market-sectors.ts.

/** Client-specified market-cap floor for every market-wide page. */
export const UNIVERSE_MIN_MARKET_CAP = 100_000_000;

/**
 * The one `company-screener` query the universe is built from. Kept as a
 * literal so `FmpService.getScreenerSnapshot` can key its 12h cache on it and
 * every caller shares the same fetch.
 *
 * `limit` is deliberately above the true row count: FMP truncates silently at
 * whatever `limit` says (asking for 5,000 returned exactly 5,000 of the 8,577
 * unfiltered matches), so it must never be the binding constraint. 10,000 is
 * the endpoint's own ceiling — 20,000 returned the same rows in twice the time.
 */
export const UNIVERSE_SCREENER_QUERY = {
  marketCapMoreThan: UNIVERSE_MIN_MARKET_CAP,
  exchange: 'NASDAQ,NYSE',
  isActivelyTrading: true,
  isEtf: false,
  isFund: false,
  limit: 10000,
} as const;

/**
 * Industries excluded from the stock universe even above the cap floor.
 *
 * 337 of the 4,311 matches are blank-check SPACs ("Shell Companies") — trusts
 * with no operations, whose price sits pinned near $10 until they merge. They
 * have no sector meaning, no fundamentals, and no analyst or dividend data, so
 * including them would pad every table and skew sector breadth statistics with
 * rows that can never carry a value. This is a NAMED, auditable exclusion
 * rather than a silent cap raise.
 */
export const EXCLUDED_UNIVERSE_INDUSTRIES = new Set(['Shell Companies']);

/**
 * FALLBACK universe — a curated ~287 liquid, widely-covered large/mid-cap U.S.
 * names. Used only when the screener snapshot is unavailable (no FMP key, FMP
 * down, or a cold serverless instance whose first request can't wait for the
 * multi-megabyte response). Kept because every page must still render real rows
 * in that state; `SECTOR_BY_TICKER` in market-sectors.ts covers exactly these
 * names, which is why a dynamic universe must take its sector from the screener
 * instead of that map.
 */
export const MARKET_UNIVERSE: string[] = [
  // Mega-cap / tech / semis / software
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'ORCL',
  'CRM', 'ADBE', 'AMD', 'CSCO', 'IBM', 'QCOM', 'TXN', 'INTU', 'NOW', 'PANW',
  'INTC', 'MU', 'PLTR', 'CRWD', 'AMAT', 'DELL', 'ADI', 'LRCX', 'KLAC', 'SNPS',
  'CDNS', 'MRVL', 'FTNT', 'ADSK', 'ROP', 'NXPI', 'MCHP', 'ANET', 'WDAY', 'TEAM',
  'DDOG', 'SNOW', 'NET', 'ZS', 'HPQ', 'HPE', 'CTSH', 'ACN', 'APH', 'TEL',
  'GLW', 'KEYS', 'ON', 'MPWR', 'SMCI', 'STX', 'WDC', 'TER', 'ZM', 'UBER',
  'ABNB', 'SHOP', 'SQ', 'PYPL', 'COIN', 'SPOT', 'ROKU', 'PINS', 'SNAP', 'DOCU',
  // Communication / media
  'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'WBD', 'EA', 'TTWO',
  'OMC', 'LYV',
  // Financials
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'V', 'MA', 'COF',
  'USB', 'PNC', 'TFC', 'BK', 'STT', 'FITB', 'HBAN', 'RF', 'KEY', 'CFG', 'MTB',
  'SPGI', 'MCO', 'ICE', 'CME', 'MSCI', 'MMC', 'AON', 'AJG', 'PGR', 'TRV', 'ALL',
  'CB', 'MET', 'PRU', 'AIG', 'AFL', 'BRK-B',
  // Healthcare / biotech / pharma
  'UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'ABT', 'AMGN', 'CVS', 'MRNA',
  'TMO', 'DHR', 'BMY', 'GILD', 'ISRG', 'MDT', 'SYK', 'BSX', 'ELV', 'CI',
  'HUM', 'CNC', 'ZTS', 'BDX', 'VRTX', 'REGN', 'BIIB', 'IDXX', 'IQV', 'DXCM',
  'A', 'MCK', 'HCA', 'EW', 'RMD', 'GEHC',
  // Consumer discretionary / staples
  'WMT', 'COST', 'HD', 'LOW', 'NKE', 'MCD', 'SBUX', 'TGT', 'KO', 'PEP', 'PG',
  'PM', 'MO', 'F', 'GM', 'BKNG', 'MAR', 'HLT', 'CMG', 'YUM', 'ORLY', 'AZO',
  'ROST', 'TJX', 'DG', 'DLTR', 'EL', 'CL', 'KMB', 'GIS', 'MDLZ', 'KHC', 'HSY',
  'STZ', 'KDP', 'MNST', 'KR', 'SYY', 'ADM', 'LULU', 'DHI', 'LEN', 'PHM',
  // Energy
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'PSX', 'MPC', 'VLO', 'WMB',
  'KMI', 'OKE', 'HES', 'DVN', 'FANG', 'HAL', 'BKR',
  // Industrials
  'CAT', 'BA', 'GE', 'HON', 'UPS', 'LMT', 'RTX', 'DE', 'UNP', 'ETN', 'EMR',
  'ITW', 'CSX', 'NSC', 'GD', 'NOC', 'FDX', 'WM', 'RSG', 'PH', 'CMI', 'PCAR',
  'ROK', 'CARR', 'OTIS', 'JCI', 'GWW', 'FAST', 'PWR', 'URI', 'AME',
  // Materials
  'LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'PPG', 'CTVA',
  'VMC', 'MLM', 'STLD', 'ALB',
  // Utilities
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'SRE', 'EXC', 'XEL', 'PEG', 'ED', 'PCG', 'EIX',
  // Real estate
  'PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'O', 'SPG', 'WELL', 'DLR', 'VICI', 'AVB',
];
