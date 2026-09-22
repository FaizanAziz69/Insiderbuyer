/**
 * Which people we hold a real photograph of.
 *
 * The client's rule (2026-09-23): a cover shows a face ONLY when we have that
 * person's actual picture. Everyone else gets an object cover in the same house
 * look. So this registry is the gate, not a nicety: if a name is not in here and
 * the feed carries no portrait, the desk does not draw a face at all.
 *
 * Two name shapes have to match the same entry. Form 4 filings arrive surname
 * first and unpunctuated ("Cohen Ryan", "Monroe James III", "Tan Anthony Ping
 * Yeow"); prose and congress rows arrive natural ("Ryan Cohen", "Nancy Pelosi").
 * Matching on a token SET rather than a string handles both without a special
 * case per filer.
 */

export interface PersonPhoto {
  /** File in public/editorial-thumbs that carries this person's face. */
  file: string;
  /** How the article should name them. */
  display: string;
}

/** Name tokens -> the thumb whose subject is that person. Every file here was
 *  checked by eye against the folder on 2026-09-23. */
const REGISTRY: Array<{ tokens: string[]; photo: PersonPhoto }> = [
  // Form 4s carry LEGAL names, prose carries the name people use. Where those
  // differ the registry needs both spellings, or the filing never matches:
  // "Wood Catherine D" is Cathie Wood, "Gates William H" is Bill Gates.
  { tokens: ['catherine', 'wood'], photo: { file: 'cathie-wood-bargain.jpg', display: 'Cathie Wood' } },
  { tokens: ['william', 'gates'], photo: { file: 'gates-four-seasons-msft.jpg', display: 'Bill Gates' } },
  { tokens: ['william', 'ackman'], photo: { file: 'ackman-uber-stake.jpg', display: 'Bill Ackman' } },
  { tokens: ['james', 'dimon'], photo: { file: 'jamie-dimon-doge.jpg', display: 'Jamie Dimon' } },
  { tokens: ['warren', 'buffett'], photo: { file: 'buffett-value-stock.jpg', display: 'Warren Buffett' } },
  // Berkshire files as the entity, but the face readers know is Buffett's.
  { tokens: ['berkshire', 'hathaway'], photo: { file: 'buffett-value-stock.jpg', display: 'Warren Buffett' } },
  { tokens: ['nancy', 'pelosi'], photo: { file: 'invest-like-pelosi.jpg', display: 'Nancy Pelosi' } },
  { tokens: ['paul', 'pelosi'], photo: { file: 'pelosi-husband-trades.jpg', display: 'Paul Pelosi' } },
  { tokens: ['elon', 'musk'], photo: { file: 'musk-congress-wealth.jpg', display: 'Elon Musk' } },
  { tokens: ['michael', 'burry'], photo: { file: 'burry-portrait-clean.jpg', display: 'Michael Burry' } },
  { tokens: ['cathie', 'wood'], photo: { file: 'cathie-wood-bargain.jpg', display: 'Cathie Wood' } },
  { tokens: ['carl', 'icahn'], photo: { file: 'carl-icahn-fertilizer.jpg', display: 'Carl Icahn' } },
  { tokens: ['jensen', 'huang'], photo: { file: 'jensen-huang-2026.jpg', display: 'Jensen Huang' } },
  { tokens: ['peter', 'thiel'], photo: { file: 'thiel-energy-power-2026.jpg', display: 'Peter Thiel' } },
  { tokens: ['bill', 'gates'], photo: { file: 'gates-four-seasons-msft.jpg', display: 'Bill Gates' } },
  { tokens: ['jamie', 'dimon'], photo: { file: 'jamie-dimon-doge.jpg', display: 'Jamie Dimon' } },
  { tokens: ['israel', 'englander'], photo: { file: 'englander-nvidia-etf.jpg', display: 'Israel Englander' } },
  { tokens: ['howard', 'lutnick'], photo: { file: 'lutnick-cantor.jpg', display: 'Howard Lutnick' } },
  { tokens: ['kash', 'patel'], photo: { file: 'kash-patel-shein.jpg', display: 'Kash Patel' } },
  { tokens: ['ryan', 'cohen'], photo: { file: 'ryan-cohen-alibaba.jpg', display: 'Ryan Cohen' } },
  { tokens: ['chamath', 'palihapitiya'], photo: { file: 'chamath-perimeter-ai.jpg', display: 'Chamath Palihapitiya' } },
  { tokens: ['kevin', 'durant'], photo: { file: 'kevin-durant-hugging-face.jpg', display: 'Kevin Durant' } },
  { tokens: ['steve', 'eisman'], photo: { file: 'steve-eisman-ai-moats.jpg', display: 'Steve Eisman' } },
  { tokens: ['gina', 'rinehart'], photo: { file: 'gina-rinehart-white-cliff-2026.jpg', display: 'Gina Rinehart' } },
  { tokens: ['dara', 'khosrowshahi'], photo: { file: 'uber-ceo-dara-khosrowshahi.jpg', display: 'Dara Khosrowshahi' } },
  { tokens: ['donald', 'trump'], photo: { file: 'trump-social-posts.jpg', display: 'Donald Trump' } },
  { tokens: ['eric', 'trump'], photo: { file: 'trump-jr-hot-stock.jpg', display: 'Eric Trump' } },
  { tokens: ['bill', 'ackman'], photo: { file: 'ackman-uber-stake.jpg', display: 'Bill Ackman' } },
  { tokens: ['talal', 'debs'], photo: { file: 'zefiro-methane-ceo.jpg', display: 'Talal Debs' } },
];

/** Suffixes and corporate noise that must not count as a name token. */
const NOISE = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv', 'inc', 'corp', 'corporation', 'llc', 'lp', 'ltd',
  'trust', 'the', 'and', 'co', 'company', 'holdings', 'group', 'partners', 'capital',
]);

function tokens(name: string): Set<string> {
  return new Set(
    (name || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !NOISE.has(t)),
  );
}

/**
 * The photograph for this filer, or null when we hold none.
 *
 * Requires EVERY registry token to be present, so "Cohen Ryan" and "Ryan Cohen"
 * both match while "Cohen Steven" (a different person entirely) does not.
 */
export function photoFor(name: string): PersonPhoto | null {
  const have = tokens(name);
  if (!have.size) return null;
  for (const entry of REGISTRY) {
    if (entry.tokens.every((t) => have.has(t))) return entry.photo;
  }
  return null;
}

/** Whether a name looks like an institution rather than a person. Used to keep
 *  the desk from writing "he bought" about a pension fund. */
export function looksInstitutional(name: string): boolean {
  return /\b(inc|corp|llc|l\.?p|ltd|trust|fund|capital|partners|management|advisors?|holdings|group|bank|asset)\b/i.test(
    name || '',
  );
}
