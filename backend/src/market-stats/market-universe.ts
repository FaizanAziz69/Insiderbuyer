// Curated universe of liquid, widely-covered U.S. tickers used to populate
// the market-wide tool pages (Analyst Ratings, Dividends, Short Interest).
// Live financial data for each is pulled from Yahoo at read time — this list
// only decides WHICH names appear, never their values.
export const MARKET_UNIVERSE: string[] = [
  // Mega-cap / tech
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  'ADBE', 'AMD', 'CSCO', 'IBM', 'QCOM', 'TXN', 'INTU', 'NOW', 'PANW', 'INTC',
  'MU', 'PLTR', 'CRWD', 'AMAT', 'DELL',
  // Financials
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'V', 'MA', 'COF',
  // Healthcare
  'UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'ABT', 'AMGN', 'CVS', 'MRNA',
  // Consumer
  'WMT', 'COST', 'HD', 'LOW', 'NKE', 'MCD', 'SBUX', 'TGT', 'KO', 'PEP', 'PG',
  'PM', 'MO', 'DIS', 'F', 'GM',
  // Energy / industrials / materials
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'CAT', 'BA', 'GE', 'HON', 'UPS',
  'LMT', 'RTX', 'NEM', 'FCX', 'NUE',
  // Telecom / utilities
  'T', 'VZ', 'TMUS', 'NEE',
];
