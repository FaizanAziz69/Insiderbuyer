/**
 * Derive a country (and clean state/province label) from a Form 4 reporting
 * owner's filing address.
 *
 * SEC Form 4 puts a 2-letter US postal code in `rptOwnerState` for US filers;
 * foreign filers leave the state blank and put a country/region in
 * `rptOwnerStateDescription`. EDGAR also defines codes for Canadian provinces
 * and some foreign regions, which we map here so a country filter works as
 * non-US sources come online.
 */

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR',
  'VI', 'GU', 'AS', 'MP',
]);

// EDGAR foreign location codes → country (the common ones; extend as needed).
const EDGAR_CANADA = new Set(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'B0']);
// Canadian province postal codes some filers use directly.
const CA_PROVINCES = new Set(['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU']);

/** Returns the best-effort country name for a filing address, or null. */
export function deriveCountry(
  state: string | null,
  stateDescription: string | null,
): string | null {
  const s = (state || '').toUpperCase().trim();
  if (US_STATES.has(s)) return 'United States';
  if (CA_PROVINCES.has(s) || EDGAR_CANADA.has(s)) return 'Canada';
  const desc = (stateDescription || '').trim();
  if (desc) {
    const d = desc.toUpperCase();
    if (d.includes('CANADA')) return 'Canada';
    if (d.includes('UNITED KINGDOM') || d === 'UK' || d.includes('ENGLAND')) return 'United Kingdom';
    if (d.includes('GERMANY')) return 'Germany';
    // Otherwise treat the description itself as the country/region label.
    return desc.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // US filers frequently leave both blank when the c/o address has no state.
  return s ? null : null;
}

/** Title-case a city for display ("MORGANTOWN" -> "Morgantown"). */
export function cleanCity(city: string | null): string | null {
  if (!city) return null;
  return city
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
