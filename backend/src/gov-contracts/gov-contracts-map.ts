/** Curated universe of large, publicly-traded U.S. federal contractors and big
 *  commercial-contract winners. `recipient` is the USAspending.gov recipient
 *  search text used to total the company's federal award dollars. Kept to major
 *  public names where a ticker→recipient match is reliable. */
export interface ContractorEntry {
  ticker: string;
  name: string;
  /** USAspending recipient_search_text (matches recipient legal name). */
  recipient: string;
  sector: string;
}

export const CONTRACTORS: ContractorEntry[] = [
  // ── Defense & aerospace primes ────────────────────────────────────────
  { ticker: 'LMT', name: 'Lockheed Martin', recipient: 'LOCKHEED MARTIN', sector: 'Aerospace & Defense' },
  { ticker: 'RTX', name: 'RTX (Raytheon)', recipient: 'RAYTHEON', sector: 'Aerospace & Defense' },
  { ticker: 'NOC', name: 'Northrop Grumman', recipient: 'NORTHROP GRUMMAN', sector: 'Aerospace & Defense' },
  { ticker: 'GD', name: 'General Dynamics', recipient: 'GENERAL DYNAMICS', sector: 'Aerospace & Defense' },
  { ticker: 'BA', name: 'Boeing', recipient: 'BOEING', sector: 'Aerospace & Defense' },
  { ticker: 'LHX', name: 'L3Harris Technologies', recipient: 'L3HARRIS', sector: 'Aerospace & Defense' },
  { ticker: 'HII', name: 'Huntington Ingalls', recipient: 'HUNTINGTON INGALLS', sector: 'Aerospace & Defense' },
  { ticker: 'TXT', name: 'Textron', recipient: 'TEXTRON', sector: 'Aerospace & Defense' },
  { ticker: 'OSK', name: 'Oshkosh', recipient: 'OSHKOSH', sector: 'Industrials' },
  { ticker: 'CW', name: 'Curtiss-Wright', recipient: 'CURTISS-WRIGHT', sector: 'Aerospace & Defense' },
  { ticker: 'HWM', name: 'Howmet Aerospace', recipient: 'HOWMET', sector: 'Aerospace & Defense' },
  { ticker: 'TDG', name: 'TransDigm', recipient: 'TRANSDIGM', sector: 'Aerospace & Defense' },

  // ── Government IT / services ──────────────────────────────────────────
  { ticker: 'LDOS', name: 'Leidos', recipient: 'LEIDOS', sector: 'Government IT & Services' },
  { ticker: 'SAIC', name: 'SAIC', recipient: 'SCIENCE APPLICATIONS INTERNATIONAL', sector: 'Government IT & Services' },
  { ticker: 'BAH', name: 'Booz Allen Hamilton', recipient: 'BOOZ ALLEN HAMILTON', sector: 'Government IT & Services' },
  { ticker: 'CACI', name: 'CACI International', recipient: 'CACI', sector: 'Government IT & Services' },
  { ticker: 'KBR', name: 'KBR', recipient: 'KBR', sector: 'Government IT & Services' },
  { ticker: 'ACN', name: 'Accenture Federal', recipient: 'ACCENTURE FEDERAL SERVICES', sector: 'Government IT & Services' },

  // ── Tech / cloud (federal cloud & software) ───────────────────────────
  { ticker: 'PLTR', name: 'Palantir', recipient: 'PALANTIR', sector: 'Technology' },
  { ticker: 'MSFT', name: 'Microsoft', recipient: 'MICROSOFT', sector: 'Technology' },
  { ticker: 'ORCL', name: 'Oracle', recipient: 'ORACLE AMERICA', sector: 'Technology' },
  { ticker: 'IBM', name: 'IBM', recipient: 'INTERNATIONAL BUSINESS MACHINES', sector: 'Technology' },
  { ticker: 'AMZN', name: 'Amazon Web Services', recipient: 'AMAZON WEB SERVICES', sector: 'Technology' },
  { ticker: 'GOOGL', name: 'Google', recipient: 'GOOGLE LLC', sector: 'Technology' },
  { ticker: 'DELL', name: 'Dell Technologies', recipient: 'DELL', sector: 'Technology' },
  { ticker: 'HPE', name: 'Hewlett Packard Enterprise', recipient: 'HEWLETT PACKARD ENTERPRISE', sector: 'Technology' },

  // ── Healthcare (federal health programs) ──────────────────────────────
  { ticker: 'UNH', name: 'UnitedHealth (Optum)', recipient: 'OPTUM', sector: 'Healthcare' },
  { ticker: 'HUM', name: 'Humana', recipient: 'HUMANA', sector: 'Healthcare' },
  { ticker: 'CNC', name: 'Centene', recipient: 'CENTENE', sector: 'Healthcare' },
  { ticker: 'MCK', name: 'McKesson', recipient: 'MCKESSON', sector: 'Healthcare' },
  { ticker: 'CAH', name: 'Cardinal Health', recipient: 'CARDINAL HEALTH', sector: 'Healthcare' },

  // ── Engineering / construction / infrastructure ───────────────────────
  { ticker: 'FLR', name: 'Fluor', recipient: 'FLUOR', sector: 'Engineering & Construction' },
  { ticker: 'J', name: 'Jacobs Solutions', recipient: 'JACOBS', sector: 'Engineering & Construction' },
  { ticker: 'ACM', name: 'AECOM', recipient: 'AECOM', sector: 'Engineering & Construction' },
  { ticker: 'PWR', name: 'Quanta Services', recipient: 'QUANTA SERVICES', sector: 'Engineering & Construction' },

  // ── Industrials / energy / other large federal suppliers ──────────────
  { ticker: 'GE', name: 'GE Aerospace', recipient: 'GENERAL ELECTRIC', sector: 'Industrials' },
  { ticker: 'HON', name: 'Honeywell', recipient: 'HONEYWELL', sector: 'Industrials' },
  { ticker: 'CAT', name: 'Caterpillar', recipient: 'CATERPILLAR', sector: 'Industrials' },
  { ticker: 'DE', name: 'Deere & Co', recipient: 'DEERE', sector: 'Industrials' },
  { ticker: 'XOM', name: 'ExxonMobil (fuel)', recipient: 'EXXON MOBIL', sector: 'Energy' },
  { ticker: 'CVX', name: 'Chevron (fuel)', recipient: 'CHEVRON', sector: 'Energy' },
];
