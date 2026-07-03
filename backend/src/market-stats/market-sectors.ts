// Authoritative sector for every ticker in MARKET_UNIVERSE. Yahoo's fast quote
// endpoint omits `sector` for most names, which dumped ~2/3 of the heatmap into
// an "Other" block. We control the universe, so we classify it here (standard
// GICS sectors) — guaranteeing clean, TradingView-style sector grouping with no
// "Other" bucket.
const BY_SECTOR: Record<string, string[]> = {
  Technology: [
    "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "ADBE", "AMD", "CSCO", "IBM",
    "QCOM", "TXN", "INTU", "NOW", "PANW", "INTC", "MU", "PLTR", "CRWD", "AMAT",
    "DELL", "ADI", "LRCX", "KLAC", "SNPS", "CDNS", "MRVL", "FTNT", "ADSK", "ROP",
    "NXPI", "MCHP", "ANET", "WDAY", "TEAM", "DDOG", "SNOW", "NET", "ZS", "HPQ",
    "HPE", "CTSH", "ACN", "APH", "TEL", "GLW", "KEYS", "ON", "MPWR", "SMCI",
    "STX", "WDC", "TER", "ZM", "SHOP", "DOCU",
  ],
  "Communication Services": [
    "GOOGL", "GOOG", "META", "SPOT", "ROKU", "PINS", "SNAP", "NFLX", "DIS",
    "CMCSA", "T", "VZ", "TMUS", "CHTR", "WBD", "EA", "TTWO", "OMC", "LYV",
  ],
  Financials: [
    "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW", "AXP", "V", "MA", "COF",
    "USB", "PNC", "TFC", "BK", "STT", "FITB", "HBAN", "RF", "KEY", "CFG", "MTB",
    "SPGI", "MCO", "ICE", "CME", "MSCI", "MMC", "AON", "AJG", "PGR", "TRV", "ALL",
    "CB", "MET", "PRU", "AIG", "AFL", "BRK-B", "PYPL", "SQ", "COIN",
  ],
  "Health Care": [
    "UNH", "LLY", "JNJ", "ABBV", "MRK", "PFE", "ABT", "AMGN", "CVS", "MRNA",
    "TMO", "DHR", "BMY", "GILD", "ISRG", "MDT", "SYK", "BSX", "ELV", "CI",
    "HUM", "CNC", "ZTS", "BDX", "VRTX", "REGN", "BIIB", "IDXX", "IQV", "DXCM",
    "A", "MCK", "HCA", "EW", "RMD", "GEHC",
  ],
  "Consumer Discretionary": [
    "AMZN", "TSLA", "HD", "LOW", "NKE", "MCD", "SBUX", "BKNG", "MAR", "HLT",
    "CMG", "YUM", "ORLY", "AZO", "ROST", "TJX", "LULU", "DHI", "LEN", "PHM",
    "F", "GM", "ABNB",
  ],
  "Consumer Staples": [
    "WMT", "COST", "TGT", "KR", "DG", "DLTR", "KO", "PEP", "PG", "PM", "MO",
    "EL", "CL", "KMB", "GIS", "MDLZ", "KHC", "HSY", "STZ", "KDP", "MNST", "SYY",
    "ADM",
  ],
  Energy: [
    "XOM", "CVX", "COP", "EOG", "SLB", "OXY", "PSX", "MPC", "VLO", "WMB", "KMI",
    "OKE", "HES", "DVN", "FANG", "HAL", "BKR",
  ],
  Industrials: [
    "CAT", "BA", "GE", "HON", "UPS", "LMT", "RTX", "DE", "UNP", "ETN", "EMR",
    "ITW", "CSX", "NSC", "GD", "NOC", "FDX", "WM", "RSG", "PH", "CMI", "PCAR",
    "ROK", "CARR", "OTIS", "JCI", "GWW", "FAST", "PWR", "URI", "AME", "UBER",
  ],
  Materials: [
    "LIN", "SHW", "APD", "ECL", "FCX", "NEM", "NUE", "DOW", "DD", "PPG", "CTVA",
    "VMC", "MLM", "STLD", "ALB",
  ],
  Utilities: [
    "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "PEG", "ED", "PCG",
    "EIX",
  ],
  "Real Estate": [
    "PLD", "AMT", "EQIX", "CCI", "PSA", "O", "SPG", "WELL", "DLR", "VICI", "AVB",
  ],
};

export const SECTOR_BY_TICKER: Record<string, string> = {};
for (const [sector, syms] of Object.entries(BY_SECTOR)) {
  for (const s of syms) SECTOR_BY_TICKER[s] = sector;
}
