// Sample U.S. House/Senate stock disclosures. Figures are sample midpoints of
// the disclosed amount ranges from public House/Senate Stock Watcher summaries.
// Real ingestion of EFD / House Clerk feeds is a follow-up; this seed exists
// to make the UI meaningful before that pipeline lands.

export interface CongressSeedRow {
  politicianName: string;
  chamber: 'House' | 'Senate';
  party: string;
  ticker: string;
  companyName: string;
  action: 'Buy' | 'Sell';
  amountMin: number;
  amountMax: number;
  transactionDate: string; // yyyy-mm-dd
  reportedDate: string;    // yyyy-mm-dd
}

export const CONGRESS_SEED: CongressSeedRow[] = [
  { politicianName: 'Nancy Pelosi',  chamber: 'House',  party: 'D', ticker: 'NVDA', companyName: 'NVIDIA Corp.', action: 'Buy',  amountMin: 1_000_000, amountMax: 5_000_000, transactionDate: '2026-05-20', reportedDate: '2026-05-27' },
  { politicianName: 'Paul Pelosi',   chamber: 'Spouse', party: 'D', ticker: 'GOOGL',companyName: 'Alphabet Inc.', action: 'Sell', amountMin: 500_000,   amountMax: 1_000_000, transactionDate: '2026-05-18', reportedDate: '2026-05-25' } as any,
  { politicianName: 'Dan Crenshaw',  chamber: 'House',  party: 'R', ticker: 'MSFT', companyName: 'Microsoft Corp.', action: 'Buy',  amountMin: 15_000,    amountMax: 50_000,    transactionDate: '2026-05-12', reportedDate: '2026-05-19' },
  { politicianName: 'Ro Khanna',     chamber: 'House',  party: 'D', ticker: 'AAPL', companyName: 'Apple Inc.', action: 'Buy',  amountMin: 1_001,      amountMax: 15_000,    transactionDate: '2026-04-13', reportedDate: '2026-04-20' },
  { politicianName: 'Ro Khanna',     chamber: 'House',  party: 'D', ticker: 'AAPL', companyName: 'Apple Inc.', action: 'Sell', amountMin: 1_001,      amountMax: 15_000,    transactionDate: '2026-02-05', reportedDate: '2026-02-12' },
  { politicianName: 'Tommy Tuberville', chamber: 'Senate', party: 'R', ticker: 'AMZN', companyName: 'Amazon.com', action: 'Buy', amountMin: 100_000, amountMax: 250_000, transactionDate: '2026-05-08', reportedDate: '2026-05-15' },
  { politicianName: 'Susan Brown',   chamber: 'House',  party: 'D', ticker: 'TSLA', companyName: 'Tesla Inc.', action: 'Sell', amountMin: 50_000,    amountMax: 100_000,   transactionDate: '2026-04-28', reportedDate: '2026-05-05' },
  { politicianName: 'Mark Green',    chamber: 'House',  party: 'R', ticker: 'LMT',  companyName: 'Lockheed Martin Corp.', action: 'Buy',  amountMin: 15_001,    amountMax: 50_000,    transactionDate: '2026-04-22', reportedDate: '2026-04-29' },
  { politicianName: 'Josh Gottheimer', chamber: 'House', party: 'D', ticker: 'RTX',  companyName: 'RTX Corp.', action: 'Buy',  amountMin: 50_001,    amountMax: 100_000,   transactionDate: '2026-04-19', reportedDate: '2026-04-26' },
  { politicianName: 'Garret Graves', chamber: 'House',  party: 'R', ticker: 'XOM',  companyName: 'Exxon Mobil', action: 'Buy',  amountMin: 1_001,     amountMax: 15_000,    transactionDate: '2026-04-15', reportedDate: '2026-04-22' },
  { politicianName: 'Markwayne Mullin', chamber: 'Senate', party: 'R', ticker: 'CVX', companyName: 'Chevron Corp.', action: 'Buy', amountMin: 15_001, amountMax: 50_000, transactionDate: '2026-04-12', reportedDate: '2026-04-19' },
  { politicianName: 'Jared Moskowitz', chamber: 'House', party: 'D', ticker: 'AMD', companyName: 'Advanced Micro Devices', action: 'Buy', amountMin: 1_001, amountMax: 15_000, transactionDate: '2026-04-08', reportedDate: '2026-04-15' },
  { politicianName: 'Nancy Pelosi',  chamber: 'House',  party: 'D', ticker: 'GOOGL',companyName: 'Alphabet Inc.', action: 'Buy',  amountMin: 1_000_000, amountMax: 5_000_000, transactionDate: '2026-03-18', reportedDate: '2026-03-25' },
  { politicianName: 'Earl Blumenauer',chamber: 'House', party: 'D', ticker: 'INTC', companyName: 'Intel Corp.', action: 'Buy',  amountMin: 1_001,     amountMax: 15_000,    transactionDate: '2026-03-15', reportedDate: '2026-03-22' },
  { politicianName: 'Don Beyer',     chamber: 'House',  party: 'D', ticker: 'MSFT', companyName: 'Microsoft Corp.', action: 'Sell', amountMin: 250_001, amountMax: 500_000, transactionDate: '2026-03-12', reportedDate: '2026-03-19' },
  { politicianName: 'Cory Booker',   chamber: 'Senate', party: 'D', ticker: 'JNJ',  companyName: 'Johnson & Johnson', action: 'Buy',  amountMin: 15_001,    amountMax: 50_000,    transactionDate: '2026-03-10', reportedDate: '2026-03-17' },
  { politicianName: 'Mark Kelly',    chamber: 'Senate', party: 'D', ticker: 'PFE',  companyName: 'Pfizer Inc.', action: 'Sell', amountMin: 50_001,    amountMax: 100_000,   transactionDate: '2026-03-05', reportedDate: '2026-03-12' },
  { politicianName: 'Steve Scalise', chamber: 'House',  party: 'R', ticker: 'COP',  companyName: 'ConocoPhillips', action: 'Buy',  amountMin: 15_001,    amountMax: 50_000,    transactionDate: '2026-03-01', reportedDate: '2026-03-08' },
  { politicianName: 'Hakeem Jeffries', chamber: 'House', party: 'D', ticker: 'BAC', companyName: 'Bank of America', action: 'Buy', amountMin: 1_001, amountMax: 15_000, transactionDate: '2026-02-26', reportedDate: '2026-03-05' },
  { politicianName: 'Tommy Tuberville', chamber: 'Senate', party: 'R', ticker: 'BA', companyName: 'Boeing Co.', action: 'Buy', amountMin: 50_001, amountMax: 100_000, transactionDate: '2026-02-22', reportedDate: '2026-03-01' },
  { politicianName: 'Suzan DelBene', chamber: 'House',  party: 'D', ticker: 'COST', companyName: 'Costco Wholesale', action: 'Buy',  amountMin: 15_001,    amountMax: 50_000,    transactionDate: '2026-02-19', reportedDate: '2026-02-26' },
  { politicianName: 'John Boozman',  chamber: 'Senate', party: 'R', ticker: 'WMT',  companyName: 'Walmart Inc.', action: 'Buy',  amountMin: 1_001,     amountMax: 15_000,    transactionDate: '2026-02-15', reportedDate: '2026-02-22' },
  { politicianName: 'Pete Aguilar',  chamber: 'House',  party: 'D', ticker: 'V',    companyName: 'Visa Inc.', action: 'Buy',  amountMin: 15_001,    amountMax: 50_000,    transactionDate: '2026-02-12', reportedDate: '2026-02-19' },
  { politicianName: 'Mike Garcia',   chamber: 'House',  party: 'R', ticker: 'NOC',  companyName: 'Northrop Grumman', action: 'Buy', amountMin: 15_001, amountMax: 50_000, transactionDate: '2026-02-10', reportedDate: '2026-02-17' },
  { politicianName: 'Lloyd Doggett', chamber: 'House',  party: 'D', ticker: 'META', companyName: 'Meta Platforms', action: 'Buy',  amountMin: 1_001,     amountMax: 15_000,    transactionDate: '2026-02-06', reportedDate: '2026-02-13' },
  { politicianName: 'Nancy Pelosi',  chamber: 'House',  party: 'D', ticker: 'AAPL', companyName: 'Apple Inc.', action: 'Buy',  amountMin: 1_000_000, amountMax: 5_000_000, transactionDate: '2026-01-29', reportedDate: '2026-02-05' },
  { politicianName: 'Sheldon Whitehouse', chamber: 'Senate', party: 'D', ticker: 'NEE', companyName: 'NextEra Energy', action: 'Buy', amountMin: 1_001, amountMax: 15_000, transactionDate: '2026-01-25', reportedDate: '2026-02-01' },
  { politicianName: 'Pat Fallon',    chamber: 'House',  party: 'R', ticker: 'OXY',  companyName: 'Occidental Petroleum', action: 'Buy', amountMin: 50_001, amountMax: 100_000, transactionDate: '2026-01-22', reportedDate: '2026-01-29' },
  { politicianName: 'Ro Khanna',     chamber: 'House',  party: 'D', ticker: 'NVDA', companyName: 'NVIDIA Corp.', action: 'Sell', amountMin: 1_001,     amountMax: 15_000,    transactionDate: '2026-01-18', reportedDate: '2026-01-25' },
  { politicianName: 'Mark Warner',   chamber: 'Senate', party: 'D', ticker: 'AMD',  companyName: 'Advanced Micro Devices', action: 'Sell', amountMin: 50_001, amountMax: 100_000, transactionDate: '2026-01-15', reportedDate: '2026-01-22' },
  { politicianName: 'Diana Harshbarger', chamber: 'House', party: 'R', ticker: 'TSLA', companyName: 'Tesla Inc.', action: 'Buy', amountMin: 50_001, amountMax: 100_000, transactionDate: '2026-01-12', reportedDate: '2026-01-19' },
  { politicianName: 'Kevin Hern',    chamber: 'House',  party: 'R', ticker: 'BRK.B', companyName: 'Berkshire Hathaway B', action: 'Buy', amountMin: 100_001, amountMax: 250_000, transactionDate: '2026-01-08', reportedDate: '2026-01-15' },
  { politicianName: 'Suzan DelBene', chamber: 'House',  party: 'D', ticker: 'GOOGL', companyName: 'Alphabet Inc.', action: 'Buy', amountMin: 15_001, amountMax: 50_000, transactionDate: '2026-01-05', reportedDate: '2026-01-12' },
];
