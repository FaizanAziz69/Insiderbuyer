/** Author attribution — SEO guardrail #5 (Content Marketing Calendar):
 *  NO synthetic authors or fabricated credentials. Programmatic/data-driven
 *  articles are attributed to the official desk profile ("IQS Financial
 *  Desk"); editorial-tier pieces to the named editorial team. Each profile
 *  maps to a real bio page at /authors/[slug] (guardrail #3). */
export interface Author {
  name: string;
  beat: string;
  /** Bio page: /authors/{slug} */
  slug: string;
}

export const AUTHOR_PROFILES: Record<string, Author> = {
  desk: {
    name: 'IQS Financial Desk',
    beat: 'Automated SEC Form 4 Analysis',
    slug: 'iqs-financial-desk',
  },
  editorial: {
    name: 'Insider Buying Editorial Team',
    beat: 'Markets & Insider Activity',
    slug: 'editorial-team',
  },
};

/** Editorial-tier kinds (Tier 1/2 in the content calendar); every other kind
 *  is a Tier 3 programmatic data page owned by the desk profile. */
const EDITORIAL_KINDS = new Set([
  'daily-summary',
  'weekly-report',
  'editorial',
  'topic-roundup',
]);

/** Resolve the author profile for an article. The seed parameter is kept for
 *  call-site compatibility (attribution is per-kind, not per-slug). */
export function authorFor(kind: string | null | undefined, _seed?: string | null): Author {
  return kind && EDITORIAL_KINDS.has(kind) ? AUTHOR_PROFILES.editorial : AUTHOR_PROFILES.desk;
}

/** Author display name for "Written by {name}". */
export function bylineFor(kind: string | null | undefined, seed?: string | null): string {
  return authorFor(kind, seed).name;
}

/** "Reviewed by" credit — the human-in-the-loop desk, never an invented (or
 *  worse, real-but-unaffiliated) person. */
export function reviewerFor(_seed?: string | null): string {
  return 'Insider Buying Data Team';
}
