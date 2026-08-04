import { Injectable, Logger } from '@nestjs/common';
import { MarketStatsService } from '../market-stats/market-stats.service';

/**
 * IQ Score v2 — Component 2: Sector Sentiment (25%).
 *
 * How "hot" a company's sector is right now. We proxy each sector with its
 * liquid SPDR sector ETF (plus a biotech theme ETF) and score momentum from
 * FREE Yahoo data — no paid feed:
 *
 *   sector_raw = 0.5·z(20d return) + 0.3·z(60d return) + 0.2·z(rel volume)
 *   SectorSentiment = percentile_rank(sector_raw across all sectors) × 100
 *
 * Computed once per day and cached; every company inherits its sector's score.
 * Thematic overrides (biotech) are matched ahead of the broad GICS bucket.
 */

interface SectorDef {
  key: string;
  etf: string;
  /** Matches a company's sector/industry string. Order matters — put the more
   *  specific theme (biotech) before the broad bucket (healthcare). */
  match: RegExp;
}

// Representative, highly-liquid ETFs (free on Yahoo). Specific themes first.
const SECTORS: SectorDef[] = [
  { key: 'Biotech', etf: 'XBI', match: /biotech|life scien|drug|therapeut|pharma/i },
  { key: 'Technology', etf: 'XLK', match: /tech|software|semiconduct|internet|comput|information technology/i },
  { key: 'Communication Services', etf: 'XLC', match: /communication|media|telecom|entertain/i },
  { key: 'Financial Services', etf: 'XLF', match: /financ|bank|insurance|capital market|asset manage/i },
  { key: 'Energy', etf: 'XLE', match: /energy|oil|gas|petroleum/i },
  { key: 'Healthcare', etf: 'XLV', match: /health|medical|hospital|diagnostic/i },
  { key: 'Industrials', etf: 'XLI', match: /industrial|aerospace|defense|machinery|transport|airline/i },
  { key: 'Consumer Cyclical', etf: 'XLY', match: /consumer cyclical|consumer discretion|retail|auto|apparel|restaurant|travel|leisure/i },
  { key: 'Consumer Defensive', etf: 'XLP', match: /consumer defensive|consumer staple|food|beverage|household|tobacco/i },
  { key: 'Utilities', etf: 'XLU', match: /utilit|electric|water|power/i },
  { key: 'Basic Materials', etf: 'XLB', match: /material|metal|mining|gold|silver|copper|steel|chemical/i },
  { key: 'Real Estate', etf: 'XLRE', match: /real estate|reit/i },
];

@Injectable()
export class SectorSentimentService {
  private readonly logger = new Logger(SectorSentimentService.name);
  /** key → 0–100 sector score, computed daily. */
  private cache: { day: string; scores: Map<string, number> } | null = null;
  private inflight: Promise<Map<string, number>> | null = null;

  constructor(private readonly marketStats: MarketStatsService) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Compute (or return cached) per-sector 0–100 scores for today. */
  async getScores(): Promise<Map<string, number>> {
    if (this.cache && this.cache.day === this.today()) return this.cache.scores;
    if (this.inflight) return this.inflight;
    this.inflight = this.compute()
      .then((scores) => {
        this.cache = { day: this.today(), scores };
        return scores;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async compute(): Promise<Map<string, number>> {
    const series = await Promise.all(
      SECTORS.map((s) => this.marketStats.getMomentumSeries(s.etf)),
    );
    const ret20 = series.map((s) => s.ret20);
    const ret60 = series.map((s) => s.ret60);
    const relVol = series.map((s) => s.relVol);

    const z = zscores(ret20);
    const z60 = zscores(ret60);
    const zv = zscores(relVol);

    const raw = SECTORS.map((_, i) => {
      const parts: Array<[number, number | null]> = [
        [0.5, z[i]],
        [0.3, z60[i]],
        [0.2, zv[i]],
      ];
      const present = parts.filter(([, v]) => v != null);
      const w = present.reduce((a, [pw]) => a + pw, 0);
      return w > 0 ? present.reduce((a, [pw, v]) => a + (v as number) * (pw / w), 0) : null;
    });

    const scores = new Map<string, number>();
    SECTORS.forEach((s, i) => {
      const pr = percentileRank(raw, raw[i]);
      if (pr != null) scores.set(s.key, +(pr * 100).toFixed(2));
    });
    this.logger.log(
      `Sector sentiment recomputed: ${scores.size}/${SECTORS.length} sectors scored.`,
    );
    return scores;
  }

  /** 0–100 score for a company's sector/industry, or null if unmapped. */
  async getScoreFor(
    sector: string | null | undefined,
    industry?: string | null,
  ): Promise<number | null> {
    const scores = await this.getScores();
    const hay = `${sector || ''} ${industry || ''}`.trim();
    if (!hay) return null;
    const def = SECTORS.find((s) => s.match.test(hay));
    if (!def) return null;
    return scores.get(def.key) ?? null;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

/** z-scores for an array with nulls preserved (null stays null). */
function zscores(xs: Array<number | null>): Array<number | null> {
  const vals = xs.filter((x): x is number => x != null && Number.isFinite(x));
  if (vals.length < 2) return xs.map(() => null);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return xs.map((x) => (x == null ? null : 0));
  return xs.map((x) => (x == null ? null : (x - mean) / sd));
}

/** Fraction (0–1) of values ≤ target. Null target/empty → null. */
function percentileRank(xs: Array<number | null>, target: number | null): number | null {
  if (target == null) return null;
  const vals = xs.filter((x): x is number => x != null && Number.isFinite(x));
  if (!vals.length) return null;
  const below = vals.filter((v) => v <= target).length;
  return below / vals.length;
}
