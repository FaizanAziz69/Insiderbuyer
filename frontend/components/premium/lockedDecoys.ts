/**
 * Fixed decoy identities for locked Top-Insider-Buys rows.
 *
 * STRICT enforcement, the same rule as PremiumValue/ScoreGate/MaskedCell: a
 * locked row never carries the real ticker, company, insider or filing URL —
 * not even blurred, because a CSS blur leaves the text in the DOM for
 * view-source. These invented names are blurred instead.
 *
 * Shared by the /insiders/top-buys table and the homepage preview module
 * (George 2026-09-14) so the two can never drift apart.
 */
export const DECOYS: Array<[string, string, string, string]> = [
  ["ACME", "Acme Holdings Inc", "J. Whitfield", "Chief Executive Officer"],
  ["NRTH", "Northline Energy Corp", "M. Okafor", "Director"],
  ["BLUE", "Bluewater Therapeutics", "S. Lindqvist", "Chief Financial Officer"],
  ["VNTG", "Vantage Semiconductor", "R. Castellano", "10% Owner"],
  ["HRBR", "Harbor Financial Group", "A. Nakamura", "President"],
  ["SLST", "Solstice Biosciences", "D. Achterberg", "Director"],
  ["PNCL", "Pinnacle Logistics Inc", "K. Moreau", "Chief Operating Officer"],
  ["GRNF", "Greenfield Materials", "T. Balogun", "Director"],
];

export const decoyFor = (i: number) => DECOYS[i % DECOYS.length];

/**
 * Fixed decoy IR-firm identities for the locked Top IR Promoters rows — same
 * rule: the real firm name, website and client tickers never enter the DOM
 * for a free visitor. Metrics stay visible; the identity is what the unlock
 * buys.
 */
export const FIRM_DECOYS: Array<[string, string]> = [
  ["Northstar IR Partners", "CA"],
  ["Cobalt Street Communications", "CA"],
  ["Meridian Capital Markets", "US"],
  ["Harborline Advisory Group", "CA"],
  ["Summit Ridge Investor Relations", "CA"],
  ["Bluepeak Media Inc", "US"],
  ["Granite Bay Consulting", "CA"],
  ["Silverline Markets Ltd", "GB"],
  ["Redwood Capital Communications", "CA"],
  ["Lakeshore Investor Services", "CA"],
];
export const firmDecoyFor = (i: number) => FIRM_DECOYS[i % FIRM_DECOYS.length];
