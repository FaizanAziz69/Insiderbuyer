import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { Last10Service } from './last10.service';
import { BADGE_CONFIG, BadgeKey, Grade, gradeForPercentile, percentileRanks } from './badges';

/**
 * Unified Top Insiders — Brief v7 Build 3.
 *
 * One card anatomy for every insider type, ranked by one comparable layer:
 * the Performance Grade, percentile-ranked WITHIN type (a senator against
 * senators, a CEO against CEOs, a fund against funds). Cross-type return
 * numbers are never presented as comparable — each card's headline stat is
 * the type's own metric, labelled, with the est. flag where the brief
 * requires it (congress and 13F figures; Form 4 figures may go unflagged).
 *
 * Grade inputs (§4.2):
 *   corporate — win rate, avg return per buy (12m, live price vs filed price),
 *               conviction (avg dollars per buy), sample size
 *   congress  — the Build 1 grade, already computed in wt_member_stats
 *   investors — the 13F engine's value-weighted trailing-12-month return,
 *               with its suppression rules; ungraded under 4 quarters
 *
 * Integrity (§4.3): a minimum sample per type (20 trades / 4 quarters) or
 * the card reads "Building track record"; everything is materialised
 * nightly into wt_unified_cards and the page reads that table only.
 */

export type UnifiedType = 'corporate' | 'congress' | 'investor';

export interface UnifiedCard {
  type: UnifiedType;
  key: string;
  href: string;
  name: string;
  subtitle: string;
  photoUrl: string | null;
  grade: Grade | null;
  gradePct: number | null;
  building: boolean;
  sampleNote: string;
  headline: { label: string; pct: number | null; est: boolean; sub: string | null };
  last10: Array<{ side: 'buy' | 'sell'; ret: number | null }>;
  topHoldings: Array<{ ticker: string; name: string }>;
  moreHoldings: number;
  activity12m: number;
  badges: BadgeKey[];
  categories: string[];
  /** For the "popular" sort: a size-ish number in the type's own units. */
  weight: number;
}

const CORPORATE_WEIGHTS = { avgReturn: 0.4, winRate: 0.3, conviction: 0.15, sample: 0.15 };
const CORPORATE_LIST_MIN_BUYS = 3;
const CORPORATE_LOOKBACK_DAYS = 3 * 365;
const CORPORATE_MAX_CARDS = 400;
const INVESTOR_MIN_QUARTERS = 4;
const ORG_NAME = /\b(l\.?l\.?c|l\.?p|ltd|inc|corp|trust|capital|partners|holdings|fund|advisors|management|investments?|group|s\.?a|plc|gmbh|n\.?v|co\.)\b/i;

@Injectable()
export class UnifiedService {
  private readonly log = new Logger(UnifiedService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly last10: Last10Service,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS wt_unified_cards (
      type text NOT NULL,
      key text NOT NULL,
      grade text,
      grade_pct real,
      headline_pct real,
      activity_12m int NOT NULL DEFAULT 0,
      weight double precision NOT NULL DEFAULT 0,
      categories jsonb NOT NULL DEFAULT '[]'::jsonb,
      card jsonb NOT NULL,
      computed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (type, key)
    )`);
  }

  // ── Build ────────────────────────────────────────────────────────────

  async rebuild(): Promise<{ corporate: number; congress: number; investor: number; graded: Record<UnifiedType, number> }> {
    await this.ensureTables();
    const [corp, cong, inv] = [await this.corporate(), await this.congress(), await this.investors()];
    const all = [...corp, ...cong, ...inv];
    await this.q(`DELETE FROM wt_unified_cards`);
    for (let i = 0; i < all.length; i += 100) {
      const chunk = all.slice(i, i + 100);
      const values: any[] = [];
      const tuples = chunk.map((c, k) => {
        const b = k * 9;
        values.push(c.type, c.key, c.grade, c.gradePct, c.headline.pct, c.activity12m, c.weight, JSON.stringify(c.categories), JSON.stringify(c));
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8}::jsonb,$${b + 9}::jsonb)`;
      });
      await this.q(`INSERT INTO wt_unified_cards (type,key,grade,grade_pct,headline_pct,activity_12m,weight,categories,card) VALUES ${tuples.join(',')}`, values);
    }
    const graded = { corporate: corp.filter((c) => c.grade).length, congress: cong.filter((c) => c.grade).length, investor: inv.filter((c) => c.grade).length };
    this.log.log(`unified cards: ${corp.length} corporate, ${cong.length} congress, ${inv.length} investors; graded ${JSON.stringify(graded)}`);
    return { corporate: corp.length, congress: cong.length, investor: inv.length, graded };
  }

  private grade(rows: Array<{ key: string; qualifies: boolean; parts: Array<[number | null, number]> }>): Map<string, { grade: Grade; pct: number }> {
    const graded = rows.filter((r) => r.qualifies);
    const n = graded[0]?.parts.length || 0;
    const cols = Array.from({ length: n }, (_, j) => percentileRanks(graded.map((r) => r.parts[j][0])));
    const composite = graded.map((r, i) => {
      let s = 0;
      let w = 0;
      r.parts.forEach(([, weight], j) => {
        const p = cols[j][i];
        if (p == null) return;
        s += p * weight;
        w += weight;
      });
      return w > 0 ? s / w : null;
    });
    const final = percentileRanks(composite);
    const out = new Map<string, { grade: Grade; pct: number }>();
    graded.forEach((r, i) => {
      const p = final[i];
      if (p != null) out.set(r.key, { grade: gradeForPercentile(p), pct: p });
    });
    return out;
  }

  private async corporate(): Promise<UnifiedCard[]> {
    const rows = await this.q<any[]>(
      `WITH tx AS (
         SELECT lower(btrim(regexp_replace(t."insiderName", '\\s+', ' ', 'g'))) AS k,
                max(t."insiderName") AS name, t."transactionCode" AS code, t."transactionDate" AS d,
                t."sharesBought" * t."pricePerShare" AS dollars, t."pricePerShare" AS px, c."lastPrice" AS live, c.ticker, c.name AS company, t.role, t."postHoldings" AS post
         FROM insider_transactions t JOIN companies c ON c.id = t.company_id
         WHERE t."transactionCode" IN ('P','S') AND t."sharesBought" * t."pricePerShare" > 0 AND t."sharesBought" * t."pricePerShare" <= 5e9
         GROUP BY 1, t.id, t."transactionCode", t."transactionDate", t."sharesBought", t."pricePerShare", c."lastPrice", c.ticker, c.name, t.role, t."postHoldings"
       ),
       agg AS (
         SELECT k, max(name) AS name,
                count(*) AS trades,
                count(*) FILTER (WHERE code = 'P') AS buys,
                count(*) FILTER (WHERE code = 'P' AND d >= current_date - ${CORPORATE_LOOKBACK_DAYS}) AS buys_recent,
                count(*) FILTER (WHERE d >= current_date - 365) AS trades_12m,
                -- Per-buy returns are clamped to [-95%, +300%]: a filed price in a
                -- different share class (ordinary vs ADS) or a bad print would
                -- otherwise hand the board to one row.
                avg(CASE WHEN code = 'P' AND live > 0 AND px > 0 AND d >= current_date - 365 THEN least(greatest((live - px) / px * 100, -95), 300) END) AS avg_ret_12m,
                avg(CASE WHEN code = 'P' AND live > 0 AND px > 0 THEN least(greatest((live - px) / px * 100, -95), 300) END) AS avg_ret_all,
                count(*) FILTER (WHERE code = 'P' AND live > 0 AND px > 0) AS priced_buys,
                count(*) FILTER (WHERE code = 'P' AND live > 0 AND px > 0 AND live > px) AS wins,
                avg(CASE WHEN code = 'P' THEN dollars END) AS avg_buy_dollars,
                sum(CASE WHEN code = 'P' THEN dollars END) AS bought,
                max(d) AS last_trade
         FROM tx GROUP BY k
       )
       SELECT * FROM agg WHERE buys_recent >= ${CORPORATE_LIST_MIN_BUYS} ORDER BY bought DESC NULLS LAST LIMIT ${CORPORATE_MAX_CARDS}`,
    );
    if (!rows.length) return [];
    const keys = rows.map((r) => r.k);
    // Role + primary company + top holdings (latest reported post-holdings × live price).
    const detail = await this.q<any[]>(
      `SELECT DISTINCT ON (k, ticker) k, ticker, company, role, post * COALESCE(live, 0) AS value, d
       FROM (
         SELECT lower(btrim(regexp_replace(t."insiderName", '\\s+', ' ', 'g'))) AS k, c.ticker, c.name AS company, t.role, t."postHoldings" AS post, c."lastPrice" AS live, t."transactionDate" AS d
         FROM insider_transactions t JOIN companies c ON c.id = t.company_id
         WHERE lower(btrim(regexp_replace(t."insiderName", '\\s+', ' ', 'g'))) = ANY($1) AND t."postHoldings" IS NOT NULL
       ) x ORDER BY k, ticker, d DESC`,
      [keys],
    );
    const holdingsBy = new Map<string, Array<{ ticker: string; name: string; value: number; role: string }>>();
    for (const r of detail) {
      const arr = holdingsBy.get(r.k) || [];
      arr.push({ ticker: r.ticker, name: r.company, value: Number(r.value) || 0, role: r.role });
      holdingsBy.set(r.k, arr);
    }
    // The portrait cache is created lazily by the content service; a fresh
    // database has no such table yet, and a card without a photo is fine.
    let portraits: Array<{ name_key: string; url: string | null }> = [];
    try {
      portraits = await this.q(`SELECT name_key, payload->>'url' AS url FROM insider_portrait_cache WHERE name_key = ANY($1) AND payload IS NOT NULL`, [keys]);
    } catch {
      portraits = [];
    }
    const photo = new Map(portraits.map((p) => [p.name_key, p.url]));

    const grades = this.grade(rows.map((r) => ({
      key: r.k,
      qualifies: Number(r.trades) >= BADGE_CONFIG.minTrades && Number(r.priced_buys) >= 5,
      parts: [
        [r.avg_ret_12m != null ? Number(r.avg_ret_12m) : r.avg_ret_all != null ? Number(r.avg_ret_all) : null, CORPORATE_WEIGHTS.avgReturn],
        [Number(r.priced_buys) > 0 ? (Number(r.wins) / Number(r.priced_buys)) * 100 : null, CORPORATE_WEIGHTS.winRate],
        [r.avg_buy_dollars != null ? Math.log10(Math.max(1, Number(r.avg_buy_dollars))) : null, CORPORATE_WEIGHTS.conviction],
        [Number(r.trades), CORPORATE_WEIGHTS.sample],
      ],
    })));

    const cards: UnifiedCard[] = [];
    for (const r of rows) {
      const hold = (holdingsBy.get(r.k) || []).filter((h) => h.value > 0).sort((a, b) => b.value - a.value);
      const roleRow = (holdingsBy.get(r.k) || [])[0];
      const role = roleRow?.role && roleRow.role !== 'Other' ? roleRow.role : ORG_NAME.test(r.name) ? 'Institution / 10% owner' : 'Insider';
      const primary = hold[0]?.ticker || roleRow?.ticker || null;
      const g = grades.get(r.k) || null;
      const l10 = await this.last10.get('insider', r.name);
      const qualifies = Number(r.trades) >= BADGE_CONFIG.minTrades && Number(r.priced_buys) >= 5;
      const winRate = Number(r.priced_buys) > 0 ? (Number(r.wins) / Number(r.priced_buys)) * 100 : null;
      cards.push({
        type: 'corporate',
        key: r.name,
        href: `/insiders/${encodeURIComponent(r.name)}`,
        name: r.name,
        subtitle: [role, primary ? `Primarily ${primary}` : null].filter(Boolean).join(' · '),
        photoUrl: photo.get(r.k) || null,
        grade: g?.grade || null,
        gradePct: g?.pct ?? null,
        building: !qualifies,
        sampleNote: qualifies ? `${r.trades} Form 4 trades · ${r.priced_buys} buys priced` : `${r.trades} of 20 trades needed for a grade`,
        headline: {
          label: 'Avg return per buy (12m)',
          pct: r.avg_ret_12m != null ? Number(r.avg_ret_12m) : null,
          est: false,
          sub: winRate != null ? `${Math.round(winRate)}% of buys up · ${r.buys} buys on record` : null,
        },
        last10: (l10?.items || []).map((i) => ({ side: i.side === 'BUY' ? 'buy' : 'sell', ret: i.returnPct })),
        topHoldings: hold.slice(0, 3).map((h) => ({ ticker: h.ticker, name: h.name })),
        moreHoldings: Math.max(0, hold.length - 3),
        activity12m: Number(r.trades_12m) || 0,
        badges: [],
        categories: [],
        weight: Number(r.bought) || 0,
      });
    }
    return cards;
  }

  private async congress(): Promise<UnifiedCard[]> {
    const rows = await this.q<any[]>(
      `SELECT m.bioguide, m.name, m.fmp_name, m.party, m.chamber, m.state, m.photo_url, m.current, s.*
       FROM wt_member_stats s JOIN wt_members m ON m.bioguide = s.bioguide WHERE s.trades_total > 0`,
    );
    return rows.map((r) => {
      const name = r.fmp_name || r.name;
      const party = r.party === 'D' ? 'Democrat' : r.party === 'R' ? 'Republican' : r.party ? 'Independent' : null;
      const grade = (r.grade as Grade | null) || null;
      return {
        type: 'congress' as const,
        key: r.bioguide,
        href: `/politicians/${encodeURIComponent(name)}`,
        name,
        subtitle: [party, r.chamber, r.state, r.current ? null : 'former'].filter(Boolean).join(' · '),
        photoUrl: r.photo_url,
        grade,
        gradePct: r.grade_pct != null ? Number(r.grade_pct) : null,
        building: !r.qualifies,
        sampleNote: r.qualifies ? `${r.priced_trades} priced trades` : `${r.priced_trades} of ${BADGE_CONFIG.minTrades} priced trades needed for a grade`,
        headline: {
          label: 'Est. portfolio growth (90d)',
          pct: r.ret_90d != null ? Number(r.ret_90d) : null,
          est: true,
          sub: r.ret_all != null ? `${Number(r.ret_all) >= 0 ? '+' : ''}${Number(r.ret_all).toFixed(1)}% since tracked (est.)` : null,
        },
        last10: (r.last10 || []).map((d: any) => ({ side: d.side, ret: d.ret })),
        topHoldings: (r.top_holdings || []).slice(0, 3).map((h: any) => ({ ticker: h.ticker, name: h.name })),
        moreHoldings: Math.max(0, Number(r.holdings) - 3),
        activity12m: Number(r.trades_12m) || 0,
        badges: (r.badges || []) as BadgeKey[],
        categories: [],
        weight: Number(r.value) || 0,
      };
    });
  }

  private async investors(): Promise<UnifiedCard[]> {
    const rows = await this.q<any[]>(
      `SELECT i.slug, i.person, i.firm, i.photo_url, i.active, i.note, i.categories,
              s.period::text AS as_of, s.market_value::float8 AS value, s.portfolio_size AS positions,
              p.ttm_return::float8 AS perf, p.suppressed_reason AS perf_note,
              (SELECT count(DISTINCT period) FROM investor_holdings h WHERE h.slug = i.slug) AS quarters,
              (SELECT count(*) FROM investor_holdings h JOIN (SELECT slug, max(period) AS period FROM investor_holdings GROUP BY slug) l ON l.slug = h.slug AND l.period = h.period
                 WHERE h.slug = i.slug AND h.put_call = 'Share') AS holdings_n
       FROM investors i
       LEFT JOIN LATERAL (SELECT * FROM investor_summary x WHERE x.slug = i.slug ORDER BY period DESC LIMIT 1) s ON true
       LEFT JOIN investor_perf p ON p.slug = i.slug
       WHERE i.active = true ORDER BY i.sort, i.person`,
    );
    if (!rows.length) return [];
    const top = await this.q<any[]>(
      `SELECT h.slug, h.ticker, h.name FROM investor_holdings h
       JOIN (SELECT slug, MAX(period) AS period FROM investor_holdings GROUP BY slug) l ON l.slug = h.slug AND l.period = h.period
       WHERE h.ticker IS NOT NULL AND h.put_call = 'Share' ORDER BY h.slug, h.value DESC`,
    );
    const topBy = new Map<string, Array<{ ticker: string; name: string }>>();
    for (const t of top) {
      const arr = topBy.get(t.slug) || [];
      if (arr.length < 3) arr.push({ ticker: t.ticker, name: t.name });
      topBy.set(t.slug, arr);
    }
    const grades = this.grade(rows.map((r) => ({
      key: r.slug,
      qualifies: r.perf != null && !r.perf_note && Number(r.quarters) >= INVESTOR_MIN_QUARTERS,
      parts: [[r.perf != null ? Number(r.perf) : null, 1]],
    })));
    const cards: UnifiedCard[] = [];
    for (const r of rows) {
      const g = grades.get(r.slug) || null;
      const qualifies = r.perf != null && !r.perf_note && Number(r.quarters) >= INVESTOR_MIN_QUARTERS;
      const l10 = await this.last10.get('investor', r.slug);
      cards.push({
        type: 'investor',
        key: r.slug,
        href: `/investors/${r.slug}`,
        name: r.person || r.firm,
        subtitle: r.person && r.firm && r.person !== r.firm ? r.firm : '13F filer',
        photoUrl: r.photo_url || null,
        grade: g?.grade || null,
        gradePct: g?.pct ?? null,
        building: !qualifies,
        sampleNote: qualifies ? `${r.quarters} quarters of 13F filings` : r.perf_note || `${r.quarters} of ${INVESTOR_MIN_QUARTERS} quarters needed for a grade`,
        headline: {
          label: '13F portfolio return (1y)',
          pct: r.perf != null && !r.perf_note ? Number(r.perf) : null,
          est: true,
          sub: r.value != null ? `${fmtMoney(Number(r.value))} portfolio · 13F ${r.as_of || ''}`.trim() : r.perf_note || null,
        },
        last10: (l10?.items || []).map((i) => ({ side: i.side === 'BUY' ? 'buy' : 'sell', ret: i.returnPct })),
        topHoldings: topBy.get(r.slug) || [],
        moreHoldings: Math.max(0, Number(r.holdings_n) - 3),
        activity12m: 0,
        badges: [],
        categories: Array.isArray(r.categories) ? r.categories : [],
        weight: Number(r.value) || 0,
      });
    }
    return cards;
  }

  // ── Reads ────────────────────────────────────────────────────────────

  async list(opts: { type: 'all' | UnifiedType; sort: 'popular' | 'performance' | 'active'; category?: string; limit: number }) {
    await this.ensureTables();
    const where: string[] = [];
    const params: any[] = [];
    if (opts.type !== 'all') {
      params.push(opts.type);
      where.push(`type = $${params.length}`);
    }
    if (opts.category) {
      params.push(JSON.stringify([opts.category]));
      where.push(`categories @> $${params.length}::jsonb`);
    }
    // Best Performance ranks graded profiles only (the §4.3 suppression rule):
    // an ungraded three-trade record is not a performance.
    if (opts.sort === 'performance') where.push('headline_pct IS NOT NULL AND grade IS NOT NULL');
    const order =
      opts.sort === 'performance' ? 'headline_pct DESC' : opts.sort === 'active' ? 'activity_12m DESC, grade_pct DESC NULLS LAST' : 'grade_pct DESC NULLS LAST, weight DESC';
    const rows = await this.q<any[]>(
      `SELECT card, computed_at FROM wt_unified_cards ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ${Math.min(Math.max(opts.limit, 1), 600)}`,
      params,
    );
    const counts = await this.q<Array<{ type: UnifiedType; n: number; graded: number }>>(`SELECT type, count(*)::int AS n, count(grade)::int AS graded FROM wt_unified_cards GROUP BY type`);
    return {
      type: opts.type,
      sort: opts.sort,
      category: opts.category || null,
      cards: rows.map((r) => r.card as UnifiedCard),
      counts: Object.fromEntries(counts.map((c) => [c.type, { total: c.n, graded: c.graded }])),
      computedAt: rows[0]?.computed_at || null,
      note:
        'Grades are percentile ranks within each insider type, on that type’s own data: Form 4 trades for corporate insiders, reconstructed STOCK Act disclosures (estimates) for Congress, 13F filings (quarter-end approximations) for funds. Return figures are not comparable across types; the grade is.',
    };
  }
}

function fmtMoney(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}
