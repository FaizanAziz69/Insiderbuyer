/**
 * Launch roster for the Top Insiders page — Developer Project Brief (Aug 24
 * 2026), Appendix A: "Tracked investor roster (71). Captured from
 * stockcircle.com, Aug 24 2026. This is the launch roster for Workstream B;
 * the admin must support adding/removing investors without a deploy."
 *
 * This file is only the SEED. It is inserted once per slug (never
 * overwriting a row the admin has edited) into the `investors` table, which
 * is what the pages read — so add/remove/re-tag happens in the admin, not
 * here. `cik` is the 13F filer resolved against FMP's filer feed on
 * 2026-08-28; `active: false` marks roster names with NO current 13F filer
 * (defunct, deregistered or never a 13F filer), which the brief wants shown
 * blanked "exactly as stockcircle blanks it for Melvin".
 *
 * Categories are the §4.1 tabs. The brief says the assignments are "an
 * editorial input — build them as a taggable field in the admin", and §11
 * asks editorial to supply the initial spreadsheet. These defaults are the
 * conventional public characterisation of each manager so the tabs are not
 * empty on launch; editorial re-tags in the admin.
 */

export type InvestorCategory = 'growth' | 'value' | 'short' | 'longterm';

export interface RosterEntry {
  slug: string;
  person: string;
  firm: string;
  cik: string | null;
  categories: InvestorCategory[];
  active: boolean;
  /** Why an inactive entry has no current filings (shown on the card). */
  note?: string;
}

export const ROSTER: RosterEntry[] = [
  { slug: 'warren-buffett', person: 'Warren Buffett', firm: 'Berkshire Hathaway', cik: '0001067983', categories: ['value', 'longterm'], active: true },
  { slug: 'cathie-wood', person: 'Cathie Wood', firm: 'ARK Invest', cik: '0001697748', categories: ['growth'], active: true },
  { slug: 'li-lu', person: 'Li Lu', firm: 'Himalaya Capital', cik: '0001709323', categories: ['value', 'longterm'], active: true },
  { slug: 'ray-dalio', person: 'Ray Dalio', firm: 'Bridgewater Associates', cik: '0001350694', categories: [], active: true },
  { slug: 'bill-ackman', person: 'Bill Ackman', firm: 'Pershing Square Capital Management', cik: '0001336528', categories: ['value', 'longterm'], active: true },
  { slug: 'charlie-munger', person: 'Charlie Munger', firm: 'Daily Journal', cik: '0000783412', categories: ['value', 'longterm'], active: true },
  { slug: 'leopold-aschenbrenner', person: 'Leopold Aschenbrenner', firm: 'Situational Awareness LP', cik: '0002045724', categories: ['growth'], active: true },
  { slug: 'michael-burry', person: 'Michael Burry', firm: 'Scion Asset Management', cik: '0001649339', categories: ['value', 'short'], active: false, note: 'Scion deregistered as an investment adviser in Nov 2025 — last 13F for Q3 2025; positions since then are self-disclosed only.' },
  { slug: 'blackrock', person: 'BlackRock', firm: 'BlackRock', cik: '0002012383', categories: ['longterm'], active: true },
  { slug: 'ken-fisher', person: 'Ken Fisher', firm: 'Fisher Asset Management', cik: '0000850529', categories: ['growth', 'longterm'], active: true },
  { slug: 'ken-griffin', person: 'Ken Griffin', firm: 'Citadel Advisors', cik: '0001423053', categories: [], active: true },
  { slug: 'primecap-management', person: 'PRIMECAP Management', firm: 'PRIMECAP Management Co', cik: '0000763212', categories: ['growth', 'longterm'], active: true },
  { slug: 'baillie-gifford', person: 'Baillie Gifford', firm: 'Baillie Gifford & Co', cik: '0001088875', categories: ['growth', 'longterm'], active: true },
  { slug: 'jim-simons', person: 'Jim Simons', firm: 'Renaissance Technologies', cik: '0001037389', categories: [], active: true },
  { slug: 'steven-cohen', person: 'Steven Cohen', firm: 'Point72 Asset Management', cik: '0001603466', categories: [], active: true },
  { slug: 'first-eagle-investments', person: 'First Eagle Investments', firm: 'First Eagle Investment Management', cik: '0001325447', categories: ['value', 'longterm'], active: true },
  { slug: 'ron-baron', person: 'Ron Baron', firm: 'Baron Funds', cik: '0001017918', categories: ['growth', 'longterm'], active: true },
  { slug: 'chris-hohn', person: 'Chris Hohn', firm: 'TCI Fund Management', cik: '0001647251', categories: ['value', 'longterm'], active: true },
  { slug: 'jeremy-grantham', person: 'Jeremy Grantham', firm: 'GMO Asset Management', cik: '0001352662', categories: ['value'], active: true },
  { slug: 'tom-russo', person: 'Tom Russo', firm: 'Gardner Russo & Gardner', cik: '0000860643', categories: ['value', 'longterm'], active: true },
  { slug: 'joel-greenblatt', person: 'Joel Greenblatt', firm: 'Gotham Asset Management', cik: '0001510387', categories: ['value'], active: true },
  { slug: 'ako-capital', person: 'AKO Capital', firm: 'AKO Capital LLP', cik: '0001376879', categories: ['growth', 'longterm'], active: true },
  { slug: 'richard-pzena', person: 'Richard Pzena', firm: 'Pzena Investment Management', cik: '0001027796', categories: ['value'], active: true },
  { slug: 'andreas-halvorsen', person: 'Andreas Halvorsen', firm: 'Viking Global Investors', cik: '0001103804', categories: ['growth'], active: true },
  { slug: 'bill-gates', person: 'Bill Gates', firm: 'Bill & Melinda Gates Foundation Trust', cik: '0001166559', categories: ['longterm'], active: true },
  { slug: 'sands-capital', person: 'Sands Capital', firm: 'Sands Capital Management', cik: '0001020066', categories: ['growth', 'longterm'], active: true },
  { slug: 'chris-davis', person: 'Chris Davis', firm: 'Davis Selected Advisers', cik: '0001036325', categories: ['value', 'longterm'], active: true },
  { slug: 'tiger-global', person: 'Tiger Global', firm: 'Tiger Global Management', cik: '0001167483', categories: ['growth'], active: true },
  { slug: 'paul-tudor-jones', person: 'Paul Tudor Jones II', firm: 'Tudor Investment Corporation', cik: '0000923093', categories: [], active: true },
  { slug: 'tom-gayner', person: 'Tom Gayner', firm: 'Markel Corporation', cik: '0001096343', categories: ['value', 'longterm'], active: true },
  { slug: 'charles-brandes', person: 'Charles Brandes', firm: 'Brandes Investment Partners', cik: '0001015079', categories: ['value'], active: true },
  { slug: 'terry-smith', person: 'Terry Smith', firm: 'Fundsmith LLP', cik: '0001569205', categories: ['growth', 'longterm'], active: true },
  { slug: 'steve-mandel', person: 'Steve Mandel', firm: 'Lone Pine Capital', cik: '0001061165', categories: ['growth'], active: true },
  { slug: 'polen-capital', person: 'Polen Capital', firm: 'Polen Capital Management', cik: '0001034524', categories: ['growth', 'longterm'], active: true },
  { slug: 'chuck-royce', person: 'Chuck Royce', firm: 'Royce Investment Partners', cik: '0000906304', categories: ['value'], active: true },
  { slug: 'mario-gabelli', person: 'Mario Gabelli', firm: 'GAMCO Investors', cik: '0000807249', categories: ['value'], active: true },
  { slug: 'al-gore', person: 'Al Gore', firm: 'Generation Investment Management', cik: '0001375534', categories: ['growth', 'longterm'], active: true },
  { slug: 'jefferies-group', person: 'Jefferies Group', firm: 'Jefferies Financial Group', cik: '0000096223', categories: [], active: true },
  { slug: 'john-w-rogers-jr', person: 'John W. Rogers Jr.', firm: 'Ariel Investments', cik: '0000936753', categories: ['value'], active: true },
  { slug: 'donald-yacktman', person: 'Donald Yacktman', firm: 'Yacktman Asset Management', cik: '0000905567', categories: ['value', 'longterm'], active: true },
  { slug: 'carl-icahn', person: 'Carl Icahn', firm: 'Icahn Capital Management', cik: '0001412093', categories: ['value'], active: true },
  { slug: 'pat-dorsey', person: 'Pat Dorsey', firm: 'Dorsey Asset Management', cik: '0001671657', categories: ['growth', 'longterm'], active: true },
  { slug: 'george-soros', person: 'George Soros', firm: 'Soros Fund Management', cik: '0001029160', categories: [], active: true },
  { slug: 'david-tepper', person: 'David Tepper', firm: 'Appaloosa LP', cik: '0001656456', categories: ['value'], active: true },
  { slug: 'jeffrey-ubben', person: 'Jeffrey Ubben', firm: 'ValueAct Holdings', cik: '0001418814', categories: ['value'], active: true },
  { slug: 'chuck-akre', person: 'Chuck Akre', firm: 'Akre Capital Management', cik: '0001112520', categories: ['growth', 'longterm'], active: true },
  { slug: 'seth-klarman', person: 'Seth Klarman', firm: 'The Baupost Group', cik: '0001061768', categories: ['value'], active: true },
  { slug: 'david-abrams', person: 'David Abrams', firm: 'Abrams Capital', cik: '0001358706', categories: ['value', 'longterm'], active: true },
  { slug: 'broad-run', person: 'Broad Run', firm: 'Broad Run Investment Management', cik: '0001568621', categories: ['growth', 'longterm'], active: true },
  { slug: 'glenn-greenberg', person: 'Glenn Greenberg', firm: 'Brave Warrior Advisors', cik: '0001553733', categories: ['value', 'longterm'], active: true },
  { slug: 'altarock-partners', person: 'Altarock Partners', firm: 'Altarock Partners LLC', cik: '0001631014', categories: ['growth', 'longterm'], active: true },
  { slug: 'daniel-loeb', person: 'Daniel Loeb', firm: 'Third Point LLC', cik: '0001040273', categories: ['value'], active: true },
  { slug: 'stanley-druckenmiller', person: 'Stanley Druckenmiller', firm: 'Duquesne Family Office', cik: '0001536411', categories: ['growth'], active: true },
  { slug: 'howard-marks', person: 'Howard Marks', firm: 'Oaktree Capital Management', cik: '0000949509', categories: ['value'], active: true },
  { slug: 'prem-watsa', person: 'Prem Watsa', firm: 'Fairfax Financial Holdings', cik: '0000915191', categories: ['value', 'longterm'], active: true },
  { slug: 'david-einhorn', person: 'David Einhorn', firm: 'Greenlight Capital', cik: '0001079114', categories: ['value', 'short'], active: true },
  { slug: 'john-paulson', person: 'John Paulson', firm: 'Paulson & Co', cik: '0001035674', categories: ['value'], active: true },
  { slug: 'cliff-sosin', person: 'Cliff Sosin', firm: 'CAS Investment Partners', cik: '0001697591', categories: ['value', 'longterm'], active: true },
  { slug: 'bruce-berkowitz', person: 'Bruce Berkowitz', firm: 'Fairholme Capital Management', cik: '0001056831', categories: ['value'], active: true },
  { slug: 'tweedy-browne', person: 'Tweedy Browne', firm: 'Tweedy Browne Company', cik: '0000732905', categories: ['value', 'longterm'], active: true },
  { slug: 'ensemble-capital', person: 'Ensemble Capital', firm: 'Ensemble Capital Management', cik: null, categories: ['growth', 'longterm'], active: false, note: 'No 13F filer of this name in the current filing season.' },
  { slug: 'third-avenue-management', person: 'Third Avenue Management', firm: 'Third Avenue Management LLC', cik: '0001099281', categories: ['value'], active: true },
  { slug: 'guy-spier', person: 'Guy Spier', firm: 'Aquamarine Capital', cik: '0002104187', categories: ['value', 'longterm'], active: true },
  { slug: 'bill-miller', person: 'Bill Miller', firm: 'Miller Value Partners', cik: '0001135778', categories: ['value'], active: true },
  { slug: 'mohnish-pabrai', person: 'Mohnish Pabrai', firm: 'Dalal Street LLC', cik: '0001549575', categories: ['value', 'longterm'], active: true },
  { slug: 'robert-bruce', person: 'Robert Bruce', firm: 'Bruce Fund / Bruce & Co', cik: '0001358331', categories: ['value'], active: true },
  { slug: 'julian-robertson', person: 'Julian Robertson', firm: 'Tiger Management', cik: null, categories: ['growth'], active: false, note: 'Julian Robertson died in 2022 and Tiger Management no longer files 13Fs.' },
  { slug: 'jim-chanos', person: 'Jim Chanos', firm: 'Kynikos Associates', cik: null, categories: ['short'], active: false, note: 'Kynikos returned outside capital in 2023 and no longer files 13Fs.' },
  { slug: 'michael-price', person: 'Michael Price', firm: 'MFP Investors', cik: null, categories: ['value'], active: false, note: 'Michael Price died in 2022; MFP Investors has no current 13F filings.' },
  { slug: 'tom-bancroft', person: 'Tom Bancroft', firm: 'Makaira Partners', cik: '0001540866', categories: ['value', 'longterm'], active: true },
  { slug: 'gabe-plotkin', person: 'Gabe Plotkin', firm: 'Melvin Capital', cik: null, categories: [], active: false, note: 'Melvin Capital wound down in 2022 — no current filings.' },
];
