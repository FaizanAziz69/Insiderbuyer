/** Editorial author roster. Each article is attributed to a real-sounding
 *  staff writer (with a beat) so the byline reads like a financial publication
 *  — "Written by {name}" + date — instead of a generic desk label.
 *  The author is chosen deterministically from the article slug, so a given
 *  article always shows the same writer. */
export interface Author {
  name: string;
  beat: string;
}

const AUTHORS: Author[] = [
  { name: "Marcus Devlin", beat: "Markets Reporter" },
  { name: "Priya Raghunathan", beat: "Senior Markets Writer" },
  { name: "Daniel Whitfield", beat: "Insider Activity Analyst" },
  { name: "Sofia Marchetti", beat: "Equities Correspondent" },
  { name: "James Okoro", beat: "Senior Research Analyst" },
  { name: "Hannah Liu", beat: "Technology & Semis Reporter" },
  { name: "Robert Castellano", beat: "Energy & Materials Writer" },
  { name: "Elena Vasquez", beat: "Healthcare & Biotech Reporter" },
  { name: "Thomas Bergstrom", beat: "Markets Editor" },
  { name: "Aisha Karim", beat: "Financials Correspondent" },
  { name: "Nathan Cole", beat: "Staff Writer" },
  { name: "Grace Yoon", beat: "Research Desk Analyst" },
];

/** Beats that fit a given article kind, so e.g. ticker deep-dives lean toward
 *  analyst voices and topic roundups toward reporters. Falls back to the full
 *  roster. */
const KIND_POOL: Record<string, number[]> = {
  "ticker-deep-dive": [2, 4, 11],
  "top-iqs": [2, 4, 11],
  "weekly-report": [1, 8, 4],
  "sector-roundup": [5, 6, 7, 9],
  "stock-idea": [0, 3, 9],
  "cluster-buy": [2, 3, 10],
  "ceo-buying": [0, 8, 3],
  "daily-summary": [0, 1, 8],
  "topic-roundup": [0, 1, 5, 7],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Resolve the full author (name + beat) for an article. */
export function authorFor(
  kind: string | null | undefined,
  seed?: string | null,
): Author {
  const key = seed && seed.length ? seed : kind || "editorial";
  const pool = (kind && KIND_POOL[kind]) || AUTHORS.map((_, i) => i);
  const idx = pool[hash(key) % pool.length];
  return AUTHORS[idx] ?? AUTHORS[0];
}

/** Author display name for "Written by {name}". Pass the article slug as the
 *  seed so each article keeps a stable writer. */
export function bylineFor(
  kind: string | null | undefined,
  seed?: string | null,
): string {
  return authorFor(kind, seed).name;
}
