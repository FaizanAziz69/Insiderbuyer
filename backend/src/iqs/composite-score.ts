/**
 * Composite scoring architecture — one 0–100 score built from weighted pillars.
 *
 * Today two pillars are wired (insider activity + analyst ratings); the
 * structure is designed so news/sentiment (and any future signal) can be added
 * by appending a pillar definition — the combiner renormalises weights across
 * whichever pillars actually have data, so partial coverage never skews the
 * scale.
 *
 * All scores are 0–100 everywhere (never 1–10).
 */

export type PillarKey = 'insider' | 'analyst' | 'sentiment';

export interface PillarDefinition {
  key: PillarKey;
  label: string;
  /** Relative weight when the pillar has data. Weights are renormalised over
   *  the pillars present, so they don't need to sum to 1. */
  weight: number;
  /** Plain-language description used by the score-explanation UI. */
  description: string;
  /** false = defined in the architecture but not yet producing data. */
  live: boolean;
}

/** The scoring model. To add a pillar (e.g. sentiment): flip `live` to true
 *  and supply a 0–100 value from its provider — nothing else changes. */
export const SCORE_PILLARS: PillarDefinition[] = [
  {
    key: 'insider',
    label: 'Insider Activity',
    weight: 0.6,
    description:
      'Quality of open-market insider buying: purchase size vs. market cap, buyer seniority (CEO/CFO), cluster effect, and stake growth. Higher = stronger insider conviction, even when the share price is falling.',
    live: true,
  },
  {
    key: 'analyst',
    label: 'Analyst Ratings',
    weight: 0.4,
    description:
      'Wall Street consensus (strong buy → sell) and analyst-implied upside to the average 12-month price target.',
    live: true,
  },
  {
    key: 'sentiment',
    label: 'News & Sentiment',
    weight: 0.25,
    description:
      'Tone of recent news coverage: analyst actions, earnings, and business headlines from the last two weeks, scored by AI. 50 = neutral; higher = bullish coverage.',
    live: true, // powered by SentimentService (Yahoo headlines + Claude scoring)
  },
];

export interface PillarValue {
  key: PillarKey;
  /** 0–100 pillar score; null when the pillar has no data for this ticker. */
  value: number | null;
}

export interface CompositeScore {
  /** 0–100 weighted composite across the pillars that have data. */
  score: number | null;
  /** Per-pillar breakdown (value + effective weight actually applied). */
  pillars: Array<{
    key: PillarKey;
    label: string;
    value: number | null;
    /** Weight applied after renormalising across available pillars (0 when the
     *  pillar had no data). */
    effectiveWeight: number;
    live: boolean;
  }>;
  /** How much of the model's total weight had data (0–1) — a confidence hint. */
  coverage: number;
}

/** Map an analyst consensus + implied upside onto a 0–100 pillar score.
 *  Consensus anchors the score; upside nudges it within the band. */
export function analystPillarScore(
  recommendation: string | null | undefined,
  upsidePct: number | null | undefined,
): number | null {
  const anchor: Record<string, number> = {
    strong_buy: 90,
    buy: 75,
    hold: 50,
    underperform: 30,
    sell: 15,
    strong_sell: 10,
  };
  const base = recommendation ? anchor[recommendation] : undefined;
  if (base === undefined && upsidePct == null) return null;
  let score = base ?? 50;
  if (upsidePct != null) {
    // ±30% implied upside moves the score up to ±10 points within the band.
    score += Math.max(-10, Math.min(10, (upsidePct / 30) * 10));
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Combine pillar values into the 0–100 composite, renormalising weights over
 *  the pillars that actually have data. */
export function computeCompositeScore(values: PillarValue[]): CompositeScore {
  const byKey = new Map(values.map((v) => [v.key, v.value]));
  const totalWeight = SCORE_PILLARS.reduce((a, p) => a + p.weight, 0);

  const present = SCORE_PILLARS.filter(
    (p) => p.live && byKey.get(p.key) != null,
  );
  const presentWeight = present.reduce((a, p) => a + p.weight, 0);

  const pillars = SCORE_PILLARS.map((p) => {
    const value = byKey.get(p.key) ?? null;
    const has = p.live && value != null;
    return {
      key: p.key,
      label: p.label,
      value,
      effectiveWeight: has && presentWeight > 0 ? p.weight / presentWeight : 0,
      live: p.live,
    };
  });

  const score =
    presentWeight > 0
      ? Math.round(
          present.reduce(
            (a, p) => a + (byKey.get(p.key) as number) * (p.weight / presentWeight),
            0,
          ),
        )
      : null;

  return { score, pillars, coverage: totalWeight > 0 ? presentWeight / totalWeight : 0 };
}
