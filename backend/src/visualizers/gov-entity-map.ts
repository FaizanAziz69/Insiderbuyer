/**
 * §6.3 the awardee-to-ticker mapping, which the brief calls "the hard problem"
 * and says IS the product.
 *
 * Government systems record the legal entity that signed the contract, not the
 * listed parent: Electric Boat, not General Dynamics; Sikorsky, not Lockheed;
 * Optum Public Sector Solutions, not UnitedHealth. Name matching cannot bridge
 * that on its own, so the review pass over the top recipients by dollars lands
 * here as two explicit lists.
 *
 * Both are matched against the normalised recipient name (upper case,
 * punctuation stripped) as a substring, longest key first, so a specific entry
 * always beats a general one.
 */

/** Federal contracting entities whose listed parent is unambiguous. */
export const SUBSIDIARY_TICKER: Record<string, string> = {
  // Defence primes and their contracting arms
  'ELECTRIC BOAT': 'GD',
  'BATH IRON WORKS': 'GD',
  'GENERAL DYNAMICS': 'GD',
  'SIKORSKY': 'LMT',
  'LOCKHEED MARTIN': 'LMT',
  'NORTHROP GRUMMAN': 'NOC',
  'RAYTHEON': 'RTX',
  'RTX': 'RTX',
  'PRATT & WHITNEY': 'RTX',
  'PRATT AND WHITNEY': 'RTX',
  'COLLINS AEROSPACE': 'RTX',
  'BOEING': 'BA',
  'MCDONNELL DOUGLAS': 'BA',
  'HUNTINGTON INGALLS': 'HII',
  'NEWPORT NEWS SHIPBUILDING': 'HII',
  'INGALLS SHIPBUILDING': 'HII',
  'L3HARRIS': 'LHX',
  'L3 TECHNOLOGIES': 'LHX',
  'HARRIS CORPORATION': 'LHX',
  'TEXTRON': 'TXT',
  'BELL TEXTRON': 'TXT',
  'OSHKOSH': 'OSK',
  'CURTISS-WRIGHT': 'CW',
  'TRANSDIGM': 'TDG',
  'HOWMET': 'HWM',
  'AEROJET': 'LHX',
  'BWX TECHNOLOGIES': 'BWXT',
  'BWXT': 'BWXT',
  'LEONARDO DRS': 'DRS',
  'KRATOS': 'KTOS',
  'AEROVIRONMENT': 'AVAV',
  'MERCURY SYSTEMS': 'MRCY',

  // Government IT and services
  'LEIDOS': 'LDOS',
  'SCIENCE APPLICATIONS INTERNATIONAL': 'SAIC',
  'BOOZ ALLEN': 'BAH',
  'CACI': 'CACI',
  'KBR': 'KBR',
  'ACCENTURE FEDERAL': 'ACN',
  'JACOBS': 'J',
  'AECOM': 'ACM',
  'FLUOR': 'FLR',
  'AMENTUM': 'AMTM',
  'V2X': 'VVX',
  'VECTRUS': 'VVX',
  'PARSONS': 'PSN',
  'ICF INTERNATIONAL': 'ICFI',
  'MAXIMUS': 'MMS',
  'GARTNER': 'IT',
  'DELOITTE CONSULTING': '',
  'TETRA TECH': 'TTEK',

  // Technology
  'PALANTIR': 'PLTR',
  'MICROSOFT': 'MSFT',
  'ORACLE': 'ORCL',
  'INTERNATIONAL BUSINESS MACHINES': 'IBM',
  'AMAZON WEB SERVICES': 'AMZN',
  'AMAZON': 'AMZN',
  'GOOGLE': 'GOOGL',
  'DELL': 'DELL',
  'HEWLETT PACKARD ENTERPRISE': 'HPE',
  'CISCO': 'CSCO',
  'VERIZON': 'VZ',
  'AT&T': 'T',
  'MOTOROLA SOLUTIONS': 'MSI',
  'CDW': 'CDW',
  'INSIGHT PUBLIC SECTOR': 'NSIT',
  'CARAHSOFT': '',

  // Healthcare payers, distributors and manufacturers
  'OPTUM': 'UNH',
  'UNITEDHEALTH': 'UNH',
  'HUMANA': 'HUM',
  'HEALTH NET FEDERAL': 'CNC',
  'CENTENE': 'CNC',
  'MCKESSON': 'MCK',
  'AMERISOURCEBERGEN': 'COR',
  'CENCORA': 'COR',
  'CARDINAL HEALTH': 'CAH',
  'PFIZER': 'PFE',
  'MERCK': 'MRK',
  'MODERNA': 'MRNA',
  'JOHNSON & JOHNSON': 'JNJ',
  'ABBVIE': 'ABBV',
  'GILEAD': 'GILD',
  'EMERGENT BIOSOLUTIONS': 'EBS',

  // Energy, industrials, transport
  'HONEYWELL': 'HON',
  'NATIONAL TECHNOLOGY & ENGINEERING SOLUTIONS OF SANDIA': 'HON',
  'CATERPILLAR': 'CAT',
  'DEERE': 'DE',
  'FEDEX': 'FDX',
  'UNITED PARCEL': 'UPS',
  'EXXON': 'XOM',
  'CHEVRON': 'CVX',
  'VALERO': 'VLO',
  'WORLD FUEL SERVICES': 'WKC',
  'WORLD KINECT': 'WKC',
};

/**
 * Recipients confirmed private, state-owned, non-profit or consortium-run.
 * Listing them explicitly is what lets the map say "private" honestly instead
 * of "we could not match this", which is a different claim (§6.1).
 */
export const KNOWN_PRIVATE: string[] = [
  'TRIWEST HEALTHCARE',
  'FISHER SAND & GRAVEL',
  'ATLANTIC DIVING SUPPLY',
  'BARNARD CONSTRUCTION',
  'TRIAD NATIONAL SECURITY',
  'LAWRENCE LIVERMORE NATIONAL SECURITY',
  'UT-BATTELLE',
  'BATTELLE MEMORIAL',
  'BATTELLE SAVANNAH',
  'FLUOR MARINE PROPULSION',
  'BECHTEL',
  'GENERAL ATOMICS',
  'SPACE EXPLORATION TECHNOLOGIES',
  'ANDURIL',
  'PERATON',
  'MANTECH',
  'DYNCORP',
  'SIERRA NEVADA CORPORATION',
  'CHUGACH',
  'AKIMA',
  'ALUTIIQ',
  'NANA REGIONAL',
  'BERING STRAITS',
  'DAVIE DEFENSE',
  'MITRE',
  'AEROSPACE CORPORATION',
  'RAND CORPORATION',
  'JOHNS HOPKINS UNIVERSITY',
  'MASSACHUSETTS INSTITUTE OF TECHNOLOGY',
  'CARNEGIE MELLON',
  'SAVANNAH RIVER NUCLEAR SOLUTIONS',
  'MISSION SUPPORT AND TEST SERVICES',
  'CONSOLIDATED NUCLEAR SECURITY',
  'HANFORD MISSION INTEGRATION',
  'CENTRAL PLATEAU CLEANUP',
];
