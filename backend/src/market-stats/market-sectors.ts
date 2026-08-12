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
  "Distribution Services": ["FAST", "GWW", "SYY"],
};

export const SECTOR_BY_TICKER: Record<string, string> = {};
for (const [sector, syms] of Object.entries(BY_SECTOR)) {
  for (const s of syms) SECTOR_BY_TICKER[s] = sector;
}

// ──────────────────────────────────────────────────────────────────────────
// FMP taxonomy → the TRBC buckets above.
//
// The map at the top of this file covers exactly the 287 curated fallback
// names. Once the universe is screener-driven (thousands of names) the sector
// has to come from the screener payload, which uses FMP's 11-sector /
// ~140-industry taxonomy — a DIFFERENT taxonomy at a coarser granularity.
// Passing it through verbatim would give the heatmap two overlapping sets of
// group headings ("Technology" next to "Electronic Technology" and "Technology
// Services"), so FMP's classification is translated into the same TRBC buckets
// the curated map already emits and the heatmap already renders.
//
// Industry is consulted FIRST because it is what carries the distinction TRBC
// draws and FMP's sector does not: FMP "Technology" spans both semiconductors /
// hardware (Electronic Technology) and software / IT services (Technology
// Services); FMP "Energy" spans producers (Energy Minerals) and oilfield
// services and pipelines (Industrial Services). The sector-level map is only
// the fallback for an industry string we haven't seen.
// ──────────────────────────────────────────────────────────────────────────
const TRBC_BY_FMP_INDUSTRY: Record<string, string> = {
  // Semiconductors, hardware, communications equipment, aerospace & defense
  Semiconductors: 'Electronic Technology',
  'Hardware, Equipment & Parts': 'Electronic Technology',
  'Communication Equipment': 'Electronic Technology',
  'Computer Hardware': 'Electronic Technology',
  'Consumer Electronics': 'Electronic Technology',
  'Aerospace & Defense': 'Electronic Technology',
  // Software, internet, IT services, gaming
  'Software - Application': 'Technology Services',
  'Software - Infrastructure': 'Technology Services',
  'Software - Services': 'Technology Services',
  'Information Technology Services': 'Technology Services',
  'Internet Content & Information': 'Technology Services',
  'Electronic Gaming & Multimedia': 'Technology Services',
  'Media & Entertainment': 'Technology Services',
  // Retail
  'Specialty Retail': 'Retail Trade',
  'Apparel - Retail': 'Retail Trade',
  'Department Stores': 'Retail Trade',
  'Discount Stores': 'Retail Trade',
  'Grocery Stores': 'Retail Trade',
  'Home Improvement': 'Retail Trade',
  'Auto - Dealerships': 'Retail Trade',
  'Luxury Goods': 'Retail Trade',
  // Banks, insurance, asset management, payments — and REITs, which the
  // curated map above also files under Finance.
  'Banks - Regional': 'Finance',
  'Banks - Diversified': 'Finance',
  'Asset Management': 'Finance',
  'Asset Management - Cryptocurrency': 'Finance',
  'Asset Management - Income': 'Finance',
  'Asset Management - Global': 'Finance',
  'Financial - Credit Services': 'Finance',
  'Financial - Capital Markets': 'Finance',
  'Financial - Conglomerates': 'Finance',
  'Financial - Data & Stock Exchanges': 'Finance',
  'Financial - Mortgages': 'Finance',
  'Financial - Diversified': 'Finance',
  'Investment - Banking & Investment Services': 'Finance',
  'Insurance - Property & Casualty': 'Finance',
  'Insurance - Diversified': 'Finance',
  'Insurance - Life': 'Finance',
  'Insurance - Specialty': 'Finance',
  'Insurance - Brokers': 'Finance',
  'Insurance - Reinsurance': 'Finance',
  // Pharma, biotech, devices
  Biotechnology: 'Health Technology',
  'Drug Manufacturers - General': 'Health Technology',
  'Drug Manufacturers - Specialty & Generic': 'Health Technology',
  'Medical - Pharmaceuticals': 'Health Technology',
  'Medical - Devices': 'Health Technology',
  'Medical - Instruments & Supplies': 'Health Technology',
  'Medical - Equipment & Services': 'Health Technology',
  'Medical - Diagnostics & Research': 'Health Technology',
  // Providers, payers, drug distribution
  'Medical - Care Facilities': 'Health Services',
  'Medical - Healthcare Plans': 'Health Services',
  'Medical - Healthcare Information Services': 'Health Services',
  'Medical - Distribution': 'Health Services',
  'Medical - Specialties': 'Health Services',
  // Food, beverage, tobacco, household & personal, apparel makers
  'Packaged Foods': 'Consumer Non-Durables',
  'Food Confectioners': 'Consumer Non-Durables',
  'Agricultural Farm Products': 'Consumer Non-Durables',
  'Beverages - Non-Alcoholic': 'Consumer Non-Durables',
  'Beverages - Alcoholic': 'Consumer Non-Durables',
  'Beverages - Wineries & Distilleries': 'Consumer Non-Durables',
  Tobacco: 'Consumer Non-Durables',
  'Household & Personal Products': 'Consumer Non-Durables',
  'Personal Products & Services': 'Consumer Non-Durables',
  'Apparel - Manufacturers': 'Consumer Non-Durables',
  'Apparel - Footwear & Accessories': 'Consumer Non-Durables',
  'Manufacturing - Textiles': 'Consumer Non-Durables',
  // Autos, homebuilders, furnishings, recreational products
  'Auto - Manufacturers': 'Consumer Durables',
  'Auto - Parts': 'Consumer Durables',
  'Auto - Recreational Vehicles': 'Consumer Durables',
  'Furnishings, Fixtures & Appliances': 'Consumer Durables',
  'Residential Construction': 'Consumer Durables',
  Leisure: 'Consumer Durables',
  // Restaurants, hotels, casinos, media, education
  Restaurants: 'Consumer Services',
  'Gambling, Resorts & Casinos': 'Consumer Services',
  'Travel Lodging': 'Consumer Services',
  'Travel Services': 'Consumer Services',
  Entertainment: 'Consumer Services',
  Broadcasting: 'Consumer Services',
  Publishing: 'Consumer Services',
  'Education & Training Services': 'Consumer Services',
  // Machinery, electrical equipment, conglomerates
  'Industrial - Machinery': 'Producer Manufacturing',
  'Agricultural - Machinery': 'Producer Manufacturing',
  'Electrical Equipment & Parts': 'Producer Manufacturing',
  'Manufacturing - Tools & Accessories': 'Producer Manufacturing',
  'Manufacturing - Metal Fabrication': 'Producer Manufacturing',
  'Manufacturing - Miscellaneous': 'Producer Manufacturing',
  'Business Equipment & Supplies': 'Producer Manufacturing',
  'Industrial - Specialties': 'Producer Manufacturing',
  'Industrial - Pollution & Treatment Controls': 'Producer Manufacturing',
  Conglomerates: 'Producer Manufacturing',
  Solar: 'Producer Manufacturing',
  // Freight, rail, air, sea
  'Airlines, Airports & Air Services': 'Transportation',
  Railroads: 'Transportation',
  Trucking: 'Transportation',
  'Integrated Freight & Logistics': 'Transportation',
  'Marine Shipping': 'Transportation',
  'General Transportation': 'Transportation',
  // Oil & gas producers
  'Oil & Gas Exploration & Production': 'Energy Minerals',
  'Oil & Gas Integrated': 'Energy Minerals',
  'Oil & Gas Refining & Marketing': 'Energy Minerals',
  'Oil & Gas Energy': 'Energy Minerals',
  Coal: 'Energy Minerals',
  // Oilfield services, pipelines, engineering, equipment rental
  'Oil & Gas Equipment & Services': 'Industrial Services',
  'Oil & Gas Drilling': 'Industrial Services',
  'Oil & Gas Midstream': 'Industrial Services',
  'Engineering & Construction': 'Industrial Services',
  Construction: 'Industrial Services',
  'Rental & Leasing Services': 'Industrial Services',
  'Industrial - Infrastructure Operations': 'Industrial Services',
  // Chemicals, paper, packaging
  Chemicals: 'Process Industries',
  'Chemicals - Specialty': 'Process Industries',
  'Agricultural Inputs': 'Process Industries',
  'Paper, Lumber & Forest Products': 'Process Industries',
  'Packaging & Containers': 'Process Industries',
  // Mining, metals, construction materials
  Gold: 'Non-Energy Minerals',
  Silver: 'Non-Energy Minerals',
  Copper: 'Non-Energy Minerals',
  Aluminum: 'Non-Energy Minerals',
  Steel: 'Non-Energy Minerals',
  'Other Precious Metals': 'Non-Energy Minerals',
  'Industrial Materials': 'Non-Energy Minerals',
  'Construction Materials': 'Non-Energy Minerals',
  // TRBC files uranium miners with the other miners, not with oil & gas, even
  // though FMP puts the industry under its Energy sector.
  Uranium: 'Non-Energy Minerals',
  // Utilities
  'Regulated Electric': 'Utilities',
  'Regulated Gas': 'Utilities',
  'Regulated Water': 'Utilities',
  'Renewable Utilities': 'Utilities',
  'Diversified Utilities': 'Utilities',
  'Independent Power Producers': 'Utilities',
  // Telecom carriers
  'Telecommunications Services': 'Communications',
  // Business & environmental services (WM/RSG sit here in the curated map too)
  'Specialty Business Services': 'Commercial Services',
  'Consulting Services': 'Commercial Services',
  'Staffing & Employment Services': 'Commercial Services',
  'Advertising Agencies': 'Commercial Services',
  'Security & Protection Services': 'Commercial Services',
  'Waste Management': 'Commercial Services',
  'Environmental Services': 'Commercial Services',
  // Wholesale distribution
  'Industrial - Distribution': 'Distribution Services',
  'Technology Distributors': 'Distribution Services',
  'Food Distribution': 'Distribution Services',
};

/** Coarse fallback when an industry string isn't in the table above (FMP adds
 *  and renames industries) — never leaves a screener row unclassified. */
const TRBC_BY_FMP_SECTOR: Record<string, string> = {
  Technology: 'Technology Services',
  Healthcare: 'Health Technology',
  'Financial Services': 'Finance',
  // Every REIT and real-estate operator; the curated map files REITs under
  // Finance as well, so both paths agree.
  'Real Estate': 'Finance',
  Industrials: 'Producer Manufacturing',
  'Consumer Cyclical': 'Consumer Services',
  'Consumer Defensive': 'Consumer Non-Durables',
  Energy: 'Energy Minerals',
  'Basic Materials': 'Process Industries',
  Utilities: 'Utilities',
  'Communication Services': 'Communications',
};

/** Translate an FMP screener row's sector/industry into the TRBC bucket set
 *  SECTOR_BY_TICKER uses, so a screener-driven universe groups identically to
 *  the curated one. Returns null only when the row carries neither field. */
export function sectorFromFmp(
  sector?: string | null,
  industry?: string | null,
): string | null {
  const byIndustry = industry ? TRBC_BY_FMP_INDUSTRY[industry.trim()] : undefined;
  if (byIndustry) return byIndustry;
  const bySector = sector ? TRBC_BY_FMP_SECTOR[sector.trim()] : undefined;
  return bySector ?? null;
}
