/**
 * Stand-in figures for a LOCKED strategy card or detail page.
 *
 * The API deletes every performance field for a guest (backend
 * strategies/gating.ts), so there is nothing real to blur. A wall over an
 * empty grid reads as a broken page, not a paywall — so the locked view draws
 * a plausible curve and plausible numbers under its blur, the way
 * <PremiumValue> blurs "88" rather than the score. Nothing here is derived
 * from real data: it is a seeded random walk keyed on the slug, so the server
 * and client renders agree and the same card looks the same on every visit.
 */

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two random walks, strategy and benchmark, `n` points from a common base. */
export function decoyWalk(slug: string, n = 40): Array<{ v: number; b: number }> {
  const r = seeded(slug);
  const drift = 0.004 + r() * 0.01;
  const out: Array<{ v: number; b: number }> = [];
  let v = 1;
  let b = 1;
  for (let i = 0; i < n; i++) {
    v *= 1 + drift + (r() - 0.5) * 0.06;
    b *= 1 + 0.005 + (r() - 0.5) * 0.04;
    out.push({ v, b });
  }
  return out;
}

export function decoyCardFigures(slug: string) {
  const r = seeded(`${slug}:figures`);
  return {
    sortino: 0.6 + r() * 1.8,
    cagr: 0.04 + r() * 0.22,
    maxDrawdown: -(0.12 + r() * 0.4),
    beat: (r() - 0.4) * 1.2,
  };
}

/** A dated series in the detail page's equity shape, $10,000 base. */
export function decoyEquity(slug: string, n = 120): Array<{ date: string; value: number; benchmark: number }> {
  const walk = decoyWalk(`${slug}:equity`, n);
  const start = Date.UTC(2021, 0, 4);
  return walk.map((p, i) => ({
    date: new Date(start + i * 14 * 86_400_000).toISOString().slice(0, 10),
    value: p.v,
    benchmark: p.b,
  }));
}
