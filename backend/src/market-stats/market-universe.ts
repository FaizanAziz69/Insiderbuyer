// Curated universe of liquid, widely-covered U.S. tickers used to populate
// the market-wide tool pages (Analyst Ratings, Dividends, Short Interest).
// Live financial data for each is pulled from Yahoo at read time — this list
// only decides WHICH names appear, never their values. Kept broad (~250 large/
// mid-cap S&P names) so those tables show as much data as we can serve without
// blowing the serverless request budget; results are cached server-side.
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
