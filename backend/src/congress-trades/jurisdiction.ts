/**
 * Top Ranking Congress Trades — Brief v5, Stage 1: the committee → agency map.
 *
 * §6 calls this "the proprietary layer; versioned" and §2 calls it "the
 * product's editorial backbone — versioned, human-maintained in admin, updated
 * each Congress". Everything else in this product is somebody else's public
 * dataset; this table is the judgement we add, and it is what decides whether
 * a member's committee has jurisdiction over the agency that wrote the cheque.
 *
 * So it lives in the database, edited in the admin, and every version is kept:
 * a flag records WHICH version of the table it was judged against (§2 Stage 3,
 * "the jurisdiction-table version"), because a mapping that changes next
 * Congress must not silently rewrite last year's published rows.
 *
 * What ships here is only the SEED — v1, the uncontroversial assignments that
 * come straight from each committee's own jurisdiction statement. Editorial
 * extends it in the admin; §8 makes that a Faizan-builds / editorial-populates
 * / George-approves item.
 *
 * Agency strings are matched against USAspending's `Awarding Agency` and
 * `Awarding Sub Agency` values, which is why they are spelled the way that API
 * spells them ("Department of Defense", not "DoD").
 *
 * SUB-AGENCIES ARE LISTED EXPLICITLY, because that is the name an award
 * usually carries. A live run produced a real National Institutes of Health
 * award and found no committee for it: the seed named only the parent
 * department, and nobody on a health committee reached it.
 */

export interface JurisdictionRule {
  /** Committee name as the unitedstates project writes it, or a subcommittee
   *  name. Matched case-insensitively against a member's assignments. */
  committee: string;
  /** Awarding agency / sub-agency names this committee oversees or funds. */
  agencies: string[];
  /** 'oversight' — the committee authorises and supervises the agency.
   *  'appropriations' — it writes the agency's budget. Both count as
   *  jurisdiction; the distinction is shown in the evidence chain so a reader
   *  can see which kind of influence is being claimed. */
  kind: 'oversight' | 'appropriations';
  /** Where this mapping comes from, shown in the evidence chain. */
  source: string;
}

/**
 * Seed v1. Deliberately conservative: every line here is a committee's own
 * published jurisdiction, not an inference. A committee that merely holds
 * hearings about an industry is NOT given jurisdiction over that industry's
 * regulator — that would manufacture flags, which is the one thing this
 * product cannot afford (§5).
 */
export const JURISDICTION_SEED: JurisdictionRule[] = [
  {
    committee: 'House Committee on Armed Services',
    agencies: [
      'Department of Defense',
      'Department of the Army',
      'Department of the Navy',
      'Department of the Air Force',
      'Defense Health Agency',
      'Defense Logistics Agency',
      'Missile Defense Agency',
      'Defense Advanced Research Projects Agency',
    ],
    kind: 'oversight',
    source: 'House Armed Services Committee jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Armed Services',
    agencies: [
      'Department of Defense',
      'Department of the Army',
      'Department of the Navy',
      'Department of the Air Force',
      'Defense Health Agency',
      'Defense Logistics Agency',
      'Missile Defense Agency',
      'Defense Advanced Research Projects Agency',
    ],
    kind: 'oversight',
    source: 'Senate Armed Services Committee jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Energy and Commerce',
    agencies: [
      'Department of Health and Human Services',
      'National Institutes of Health',
      'Centers for Disease Control and Prevention',
      'Centers for Medicare and Medicaid Services',
      'Food and Drug Administration',
      'Department of Energy',
      'Federal Communications Commission',
      'Environmental Protection Agency',
    ],
    kind: 'oversight',
    source: 'House Energy and Commerce jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Energy and Natural Resources',
    agencies: ['Department of Energy', 'Department of the Interior'],
    kind: 'oversight',
    source: 'Senate Energy and Natural Resources jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'Senate Committee on Health, Education, Labor, and Pensions',
    agencies: [
      'Department of Health and Human Services',
      'National Institutes of Health',
      'Centers for Disease Control and Prevention',
      'Centers for Medicare and Medicaid Services',
      'Food and Drug Administration',
      'Department of Labor',
      'Department of Education',
    ],
    kind: 'oversight',
    source: 'Senate HELP Committee jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Homeland Security',
    agencies: ['Department of Homeland Security'],
    kind: 'oversight',
    source: 'House Homeland Security jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Homeland Security and Governmental Affairs',
    agencies: ['Department of Homeland Security', 'General Services Administration'],
    kind: 'oversight',
    source: 'Senate HSGAC jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Veterans’ Affairs',
    agencies: ['Department of Veterans Affairs'],
    kind: 'oversight',
    source: 'House Veterans Affairs jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Veterans’ Affairs',
    agencies: ['Department of Veterans Affairs'],
    kind: 'oversight',
    source: 'Senate Veterans Affairs jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Transportation and Infrastructure',
    agencies: ['Department of Transportation', 'Federal Aviation Administration', 'Army Corps of Engineers'],
    kind: 'oversight',
    source: 'House Transportation and Infrastructure jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Commerce, Science, and Transportation',
    agencies: [
      'Department of Transportation',
      'Federal Aviation Administration',
      'National Aeronautics and Space Administration',
      'Department of Commerce',
      'National Oceanic and Atmospheric Administration',
    ],
    kind: 'oversight',
    source: 'Senate Commerce Committee jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Science, Space, and Technology',
    agencies: [
      'National Aeronautics and Space Administration',
      'National Science Foundation',
      'Department of Energy',
      'National Institute of Standards and Technology',
    ],
    kind: 'oversight',
    source: 'House Science, Space, and Technology jurisdiction (House Rule X)',
  },
  {
    committee: 'House Committee on Agriculture',
    agencies: ['Department of Agriculture'],
    kind: 'oversight',
    source: 'House Agriculture jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Agriculture, Nutrition, and Forestry',
    agencies: ['Department of Agriculture'],
    kind: 'oversight',
    source: 'Senate Agriculture jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on the Judiciary',
    agencies: ['Department of Justice', 'Federal Bureau of Investigation'],
    kind: 'oversight',
    source: 'House Judiciary jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on the Judiciary',
    agencies: ['Department of Justice', 'Federal Bureau of Investigation'],
    kind: 'oversight',
    source: 'Senate Judiciary jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Foreign Affairs',
    agencies: ['Department of State', 'Agency for International Development'],
    kind: 'oversight',
    source: 'House Foreign Affairs jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Foreign Relations',
    agencies: ['Department of State', 'Agency for International Development'],
    kind: 'oversight',
    source: 'Senate Foreign Relations jurisdiction (Senate Rule XXV)',
  },
  {
    committee: 'House Committee on Natural Resources',
    agencies: ['Department of the Interior'],
    kind: 'oversight',
    source: 'House Natural Resources jurisdiction (House Rule X)',
  },
  {
    committee: 'Senate Committee on Environment and Public Works',
    agencies: ['Environmental Protection Agency', 'Army Corps of Engineers', 'Department of Transportation'],
    kind: 'oversight',
    source: 'Senate EPW jurisdiction (Senate Rule XXV)',
  },

  // ── Appropriations ──────────────────────────────────────────────────────
  // §2 names appropriations subcommittees explicitly ("Appropriations
  // subcommittees → their bill's agencies"). The full committee is NOT given
  // blanket jurisdiction over every agency in the budget: that single line
  // would flag every appropriator against every contract in the country and
  // drown the leaderboard in noise that means nothing.
  {
    committee: 'Subcommittee on Defense',
    agencies: ['Department of Defense', 'Department of the Army', 'Department of the Navy', 'Department of the Air Force'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Defense — the Defense appropriations bill',
  },
  {
    committee: 'Subcommittee on Labor, Health and Human Services, Education, and Related Agencies',
    agencies: [
      'Department of Health and Human Services',
      'National Institutes of Health',
      'Centers for Disease Control and Prevention',
      'Centers for Medicare and Medicaid Services',
      'Department of Labor',
      'Department of Education',
    ],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Labor-HHS-Education',
  },
  {
    committee: 'Subcommittee on Homeland Security',
    agencies: ['Department of Homeland Security'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Homeland Security',
  },
  {
    committee: 'Subcommittee on Energy and Water Development',
    agencies: ['Department of Energy', 'Army Corps of Engineers'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Energy and Water Development',
  },
  {
    committee: 'Subcommittee on Military Construction, Veterans Affairs, and Related Agencies',
    agencies: ['Department of Veterans Affairs', 'Department of Defense'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on MilCon-VA',
  },
  {
    committee: 'Subcommittee on Commerce, Justice, Science, and Related Agencies',
    agencies: [
      'Department of Commerce',
      'Department of Justice',
      'National Aeronautics and Space Administration',
      'National Science Foundation',
    ],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Commerce-Justice-Science',
  },
  {
    committee: 'Subcommittee on Transportation, Housing and Urban Development, and Related Agencies',
    agencies: ['Department of Transportation', 'Department of Housing and Urban Development', 'Federal Aviation Administration'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Transportation-HUD',
  },
  {
    committee: 'Subcommittee on Agriculture, Rural Development, Food and Drug Administration, and Related Agencies',
    agencies: ['Department of Agriculture', 'Food and Drug Administration'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Agriculture-FDA',
  },
  {
    committee: 'Subcommittee on Interior, Environment, and Related Agencies',
    agencies: ['Department of the Interior', 'Environmental Protection Agency'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on Interior-Environment',
  },
  {
    committee: 'Subcommittee on State, Foreign Operations, and Related Programs',
    agencies: ['Department of State', 'Agency for International Development'],
    kind: 'appropriations',
    source: 'Appropriations Subcommittee on State-Foreign Operations',
  },
];

/**
 * An agency name from USAspending, reduced to a comparable key.
 *
 * USAspending is not consistent about how it writes the same body — an award
 * can name "Department of Defense" at agency level and "Defense Health Agency"
 * at sub-agency level — so both the award's agency and its sub-agency are
 * tested against the table and a hit on either counts.
 */
export function agencyKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\bu\.?s\.?\b/g, '')
    .replace(/\bdept\.?\b/g, 'department')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Committee name reduced for matching a member's assignment strings. */
export function committeeKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/\b(house|senate|committee|on|the|and|of)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
