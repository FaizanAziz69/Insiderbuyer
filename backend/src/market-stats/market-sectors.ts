// Authoritative sector for every ticker in MARKET_UNIVERSE, using TradingView's
// sector taxonomy (TRBC economic sectors) so the market heatmap groups exactly
// like tradingview.com/heatmap/stock — Electronic Technology, Technology
// Services, Retail Trade, Finance, Health Technology, etc. Yahoo's fast quote
// omits sector for most names, so we classify here (no "Other" bucket).
const BY_SECTOR: Record<string, string[]> = {
  // Semiconductors, hardware, and aerospace & defense
  "Electronic Technology": [
    "AAPL", "NVDA", "AVGO", "AMD", "CSCO", "QCOM", "TXN", "INTC", "MU", "DELL",
    "ADI", "KLAC", "MRVL", "NXPI", "MCHP", "ANET", "HPQ", "HPE", "APH", "TEL",
    "GLW", "KEYS", "ON", "MPWR", "SMCI", "STX", "WDC", "TER", "BA", "LMT",
    "RTX", "NOC", "GD", "GE",
  ],
  // Software, internet, and IT services
  "Technology Services": [
    "MSFT", "GOOGL", "GOOG", "META", "ORCL", "CRM", "ADBE", "IBM", "INTU", "NOW",
    "PANW", "PLTR", "CRWD", "SNPS", "CDNS", "FTNT", "ADSK", "ROP", "WDAY", "TEAM",
    "DDOG", "SNOW", "NET", "ZS", "CTSH", "ACN", "ZM", "UBER", "SHOP", "SQ",
    "SPOT", "PINS", "SNAP", "DOCU", "NFLX", "EA", "TTWO",
  ],
  "Retail Trade": [
    "AMZN", "WMT", "COST", "HD", "LOW", "TGT", "TJX", "ROST", "ORLY", "AZO",
    "DG", "DLTR", "KR", "LULU",
  ],
  // Banks, insurance, asset management, exchanges, payments, and REITs
  Finance: [
    "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW", "AXP", "V", "MA", "COF",
    "USB", "PNC", "TFC", "BK", "STT", "FITB", "HBAN", "RF", "KEY", "CFG", "MTB",
    "SPGI", "MCO", "ICE", "CME", "MSCI", "MMC", "AON", "AJG", "PGR", "TRV", "ALL",
    "CB", "MET", "PRU", "AIG", "AFL", "BRK-B", "PYPL", "COIN", "PLD", "AMT",
    "EQIX", "CCI", "PSA", "O", "SPG", "WELL", "DLR", "VICI", "AVB",
  ],
  // Pharma, biotech, and medical devices
  "Health Technology": [
    "LLY", "JNJ", "ABBV", "MRK", "PFE", "ABT", "AMGN", "MRNA", "TMO", "DHR",
    "BMY", "GILD", "ISRG", "MDT", "SYK", "BSX", "ZTS", "BDX", "VRTX", "REGN",
    "BIIB", "IDXX", "DXCM", "A", "EW", "RMD", "GEHC",
  ],
  // Managed care, providers, and drug distribution
  "Health Services": ["UNH", "CVS", "CI", "ELV", "HUM", "CNC", "HCA", "MCK", "IQV"],
  // Food, beverage, tobacco, household & personal, apparel makers
  "Consumer Non-Durables": [
    "KO", "PEP", "PG", "PM", "MO", "EL", "CL", "KMB", "GIS", "MDLZ", "KHC",
    "HSY", "STZ", "KDP", "MNST", "NKE", "ADM",
  ],
  "Consumer Durables": ["TSLA", "F", "GM", "DHI", "LEN", "PHM"],
  // Restaurants, hotels, media, and leisure
  "Consumer Services": [
    "MCD", "SBUX", "CMG", "YUM", "MAR", "HLT", "ABNB", "BKNG", "DIS", "CMCSA",
    "CHTR", "WBD", "LYV", "ROKU",
  ],
  // Machinery, equipment, electrical, and semiconductor equipment
  "Producer Manufacturing": [
    "CAT", "DE", "ETN", "EMR", "ITW", "HON", "PH", "CMI", "ROK", "CARR", "OTIS",
    "JCI", "AME", "PCAR", "AMAT", "LRCX",
  ],
  Transportation: ["UPS", "FDX", "CSX", "NSC", "UNP"],
  // Oil & gas exploration/production and integrated
  "Energy Minerals": [
    "XOM", "CVX", "COP", "EOG", "OXY", "PSX", "MPC", "VLO", "HES", "DVN", "FANG",
  ],
  // Oilfield services, pipelines, engineering, equipment rental
  "Industrial Services": ["SLB", "HAL", "BKR", "WMB", "KMI", "OKE", "PWR", "URI"],
  // Chemicals
  "Process Industries": ["LIN", "SHW", "APD", "ECL", "DOW", "DD", "PPG", "CTVA", "ALB"],
  // Mining, metals, and construction materials
  "Non-Energy Minerals": ["FCX", "NEM", "NUE", "STLD", "VMC", "MLM"],
  Utilities: [
    "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "PEG", "ED", "PCG", "EIX",
  ],
  Communications: ["T", "VZ", "TMUS"],
  "Commercial Services": ["OMC", "WM", "RSG"],
  "Distribution Services": ["FAST", "GWW"],
};

export const SECTOR_BY_TICKER: Record<string, string> = {};
for (const [sector, syms] of Object.entries(BY_SECTOR)) {
  for (const s of syms) SECTOR_BY_TICKER[s] = sector;
}
