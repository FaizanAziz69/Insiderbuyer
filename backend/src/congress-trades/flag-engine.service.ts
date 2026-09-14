import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { AwardsService, AwardRow } from './awards.service';
import { EntityResolutionService } from './entity-resolution.service';
import { InfluenceMapService, nameKey } from './influence-map.service';
import {
  CTS_DEFAULT_WEIGHTS,
  CtsWeights,
  checkCopy,
  flagHeadline,
  normalizeCtsWeights,
  scoreCts,
  CommitteeRole,
} from './cts';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 3: the cross-reference engine.
 *
 * §2's flag condition, all three legs required:
 *   [member holds or traded ticker T within window W]
 *   AND [agency A awarded a contract to T or its subsidiary]
 *   AND [member's committee has jurisdiction over A]
 *
 * §7 P1 accepts only when "zero flags without all three legs" and "every
 * flag's evidence chain complete and clickable", so the three legs are checked
 * in one place and the evidence is assembled in the same breath as the flag —
 * not reconstructed later, when a source may already have moved.
 */

export interface FlagRow {
  id: number;
  member: string;
  party: string | null;
  chamber: string | null;
  ticker: string;
  company: string;
  agency: string;
  subAgency: string | null;
  awardValue: number;
  awardDate: string;
  tradeDate: string | null;
  tradeAction: string | null;
  tradeValue: number | null;
  committee: string;
  role: CommitteeRole;
  score: number | null;
  components: Record<string, number | null>;
  headline: string;
  evidence: any;
  status: string;
}

@Injectable()
export class FlagEngineService {
  private readonly log = new Logger(FlagEngineService.name);
  private ready = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly awards: AwardsService,
    private readonly vendors: EntityResolutionService,
    private readonly influence: InfluenceMapService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_flags (
      id            bigserial PRIMARY KEY,
      flag_type     varchar(16) NOT NULL DEFAULT 'trade',
      member        text NOT NULL,
      bioguide      varchar(16),
      party         varchar(30),
      chamber       varchar(10),
      ticker        varchar(16) NOT NULL,
      company       text,
      award_key     text NOT NULL,
      agency        text NOT NULL,
      sub_agency    text,
      award_value   numeric(20,2) NOT NULL,
      award_date    date NOT NULL,
      trade_id      uuid,
      trade_date    date,
      trade_action  varchar(10),
      trade_value   numeric(18,2),
      committee     text NOT NULL,
      committee_parent text,
      via_subcommittee boolean NOT NULL DEFAULT false,
      role          varchar(16) NOT NULL DEFAULT 'member',
      jurisdiction_kind varchar(16),
      jurisdiction_version int,
      score         real,
      components    jsonb NOT NULL DEFAULT '{}'::jsonb,
      headline      text,
      evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
      -- §2 Stage 5: nothing renders publicly without a passing verification.
      status        varchar(16) NOT NULL DEFAULT 'pending',
      verified_at   timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_flags_score_idx ON ct_flags (score DESC NULLS LAST)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_flags_member_idx ON ct_flags (lower(member))`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_flags_ticker_idx ON ct_flags (ticker)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_flags_status_idx ON ct_flags (status)`);
    // One member, one award, one trade is one flag. Re-running the engine
    // must refresh a row, never mint a second copy of the same fact.
    await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS ct_flags_uniq
      ON ct_flags (member, award_key, ticker, COALESCE(trade_date, '1900-01-01'::date), committee)`);
    this.ready = true;
  }

  // ── Weights (§3, "George approves final weights before launch") ─────────

  async weights(): Promise<CtsWeights> {
    await this.awards.ensureTables();
    const row = (await this.q(`SELECT value FROM ct_config WHERE key = 'cts_weights'`))?.[0];
    return normalizeCtsWeights(row?.value ?? CTS_DEFAULT_WEIGHTS);
  }

  async setWeights(next: Partial<CtsWeights>, actor: string): Promise<CtsWeights> {
    await this.awards.ensureTables();
    const before = await this.weights();
    const clean: Partial<CtsWeights> = {};
    for (const [k, v] of Object.entries(next || {})) {
      const n = Number(v);
      if (k in CTS_DEFAULT_WEIGHTS && isFinite(n) && n >= 0 && n <= 1000) (clean as any)[k] = n;
    }
    const merged = normalizeCtsWeights({ ...before, ...clean });
    await this.q(
      `INSERT INTO ct_config (key, value, updated_at) VALUES ('cts_weights', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(merged)],
    );
    this.log.log(`CTS weights changed by ${actor}: ${JSON.stringify(merged)}`);
    await this.rescore();
    return merged;
  }

  // ── The engine ─────────────────────────────────────────────────────────

  /**
   * Build flags for every award in the window.
   *
   * Order matters for cost: an award is dropped as early as possible. Most
   * awards go to vendors with no ticker at all, and those die before any
   * trade or committee lookup happens.
   */
  async run(days = 120): Promise<{ awards: number; withTicker: number; flags: number }> {
    await this.ensureTables();
    const cfg = await this.awards.config();
    const weights = await this.weights();
    const awards = await this.awards.recent(days);
    let withTicker = 0;
    let flags = 0;

    for (const award of awards) {
      const vendor = await this.vendors.lookup(award.recipientUei, award.recipientName);
      if (!vendor || vendor.status !== 'ticker' || !vendor.ticker) continue;
      withTicker++;

      // Leg 1 — who held or traded this ticker inside the window.
      const holders = await this.holdersOf(vendor.ticker, award.actionDate, cfg.windowDays);
      if (!holders.length) continue;

      for (const h of holders) {
        // Leg 3 — does this member's committee service reach this agency?
        const hits = await this.influence.jurisdictionFor(h.member, award.agency, award.subAgency);
        if (!hits.length) continue;

        // The strongest seat is what scores: a member on both the authorising
        // committee and the appropriations subcommittee is closest to the
        // money through the latter.
        const seat = hits.sort((a, b) => seatRank(b) - seatRank(a))[0];

        const median = await this.medianTrade(h.member);
        const revenue = await this.revenueOf(vendor.ticker);
        const daysTradeToAward =
          h.tradeDate != null
            ? Math.round((Date.parse(h.tradeDate) - Date.parse(award.actionDate)) / 86_400_000)
            : null;

        const cts = scoreCts(
          {
            role: seat.role,
            viaSubcommittee: seat.isSubcommittee,
            daysTradeToAward,
            positionValue: h.tradeValue,
            memberMedianTrade: median,
            awardValue: award.amount,
            companyRevenue: revenue,
          },
          weights,
        );

        const headline = flagHeadline({
          member: h.member,
          committee: seat.committee,
          agency: award.subAgency || award.agency,
          awardValue: award.amount,
          company: vendor.listedName || vendor.vendorName,
          ticker: vendor.ticker,
        });
        // §5 is enforced here, not trusted: a headline that trips the list is
        // dropped rather than published, and the row is logged so the template
        // can be fixed.
        const copy = checkCopy(headline);
        if (!copy.ok) {
          this.log.error(
            `headline rejected for ${h.member}/${vendor.ticker}: ${copy.violations.map((v) => v.term).join(', ')}`,
          );
          continue;
        }

        await this.store({
          award,
          vendor,
          holder: h,
          seat,
          cts,
          headline,
        });
        flags++;
      }
    }

    this.log.log(`flag engine: ${awards.length} awards, ${withTicker} with a ticker, ${flags} flags`);
    return { awards: awards.length, withTicker, flags };
  }

  /**
   * Leg 1. A trade inside the window, or a position the member still reports
   * holding at the award date.
   *
   * §2's default window is "trades within 180 days before/after award", and
   * the disclosure lag (§5: up to 45 days) is why the search is on the
   * TRANSACTION date while the disclosure date is carried separately — a
   * reader must be able to see both, and confusing them would overstate how
   * quickly anything was known.
   */
  private async holdersOf(ticker: string, awardDate: string, windowDays: number) {
    const rows: any[] = await this.q(
      `SELECT id, "politicianName" AS member, party, chamber, action,
              "transactionDate" AS trade_date, "reportedDate" AS reported_date,
              "amountMin"::float8 AS amin, "amountMax"::float8 AS amax
         FROM congressional_transactions
        WHERE ticker = $1
          AND "transactionDate" BETWEEN ($2::date - ($3 || ' days')::interval)
                                    AND ($2::date + ($3 || ' days')::interval)
        ORDER BY "transactionDate" DESC
        LIMIT 200`,
      [ticker, awardDate, String(windowDays)],
    );
    return rows.map((r) => ({
      tradeId: r.id as string,
      member: r.member as string,
      party: r.party as string | null,
      chamber: r.chamber as string | null,
      action: r.action as string,
      tradeDate: isoOf(r.trade_date),
      reportedDate: isoOf(r.reported_date),
      // §5: "every amount is labeled an estimate from the disclosed range" —
      // the midpoint is the estimate, and the range is kept in the evidence.
      tradeValue: midpoint(r.amin, r.amax),
      amountMin: r.amin as number | null,
      amountMax: r.amax as number | null,
    }));
  }

  /** That member's typical disclosed trade, for §3's position-size factor. */
  private async medianTrade(member: string): Promise<number | null> {
    const r = (
      await this.q(
        `SELECT percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY (COALESCE("amountMin",0) + COALESCE("amountMax","amountMin"))/2.0
                )::float8 AS med
           FROM congressional_transactions
          WHERE lower("politicianName") = lower($1) AND "amountMin" IS NOT NULL`,
        [member],
      )
    )?.[0];
    const v = Number(r?.med);
    return isFinite(v) && v > 0 ? v : null;
  }

  private async revenueOf(ticker: string): Promise<number | null> {
    const r = (
      await this.q(`SELECT "revenueTtm"::float8 AS rev FROM bubbles_cache WHERE symbol = $1`, [ticker]).catch(
        () => [],
      )
    )?.[0];
    const v = Number(r?.rev);
    return isFinite(v) && v > 0 ? v : null;
  }

  private async store(x: {
    award: AwardRow;
    vendor: any;
    holder: any;
    seat: any;
    cts: any;
    headline: string;
  }) {
    // §2 Stage 3: "Every flag stores its full evidence chain … one click from
    // any public surface to every underlying document."
    const evidence = {
      trade: {
        source: 'House/Senate periodic transaction report',
        member: x.holder.member,
        action: x.holder.action,
        transactionDate: x.holder.tradeDate,
        disclosureDate: x.holder.reportedDate,
        disclosedRange:
          x.holder.amountMin != null ? { min: x.holder.amountMin, max: x.holder.amountMax } : null,
        estimateNote: 'Amount is the midpoint of the disclosed range.',
      },
      committee: {
        source: 'unitedstates/congress-legislators committee-membership-current',
        committee: x.seat.committee,
        parent: x.seat.parent,
        role: x.seat.role,
        viaSubcommittee: x.seat.isSubcommittee,
      },
      jurisdiction: {
        kind: x.seat.kind,
        basis: x.seat.source,
        tableVersion: x.seat.tableVersion,
      },
      award: {
        source: 'USAspending.gov',
        awardId: x.award.awardId,
        url: `https://www.usaspending.gov/award/${encodeURIComponent(x.award.awardKey)}`,
        agency: x.award.agency,
        subAgency: x.award.subAgency,
        amount: x.award.amount,
        actionDate: x.award.actionDate,
        recipient: x.award.recipientName,
        uei: x.award.recipientUei,
      },
      vendorResolution: {
        method: x.vendor.method,
        listedName: x.vendor.listedName,
        chain: x.vendor.evidence,
      },
    };

    await this.q(
      `INSERT INTO ct_flags
         (flag_type, member, party, chamber, ticker, company, award_key, agency, sub_agency,
          award_value, award_date, trade_id, trade_date, trade_action, trade_value,
          committee, committee_parent, via_subcommittee, role, jurisdiction_kind,
          jurisdiction_version, score, components, headline, evidence, status, updated_at)
       VALUES ('trade',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24::jsonb,'pending', now())
       ON CONFLICT (member, award_key, ticker, COALESCE(trade_date, '1900-01-01'::date), committee)
       DO UPDATE SET
         award_value = EXCLUDED.award_value,
         score = EXCLUDED.score,
         components = EXCLUDED.components,
         headline = EXCLUDED.headline,
         evidence = EXCLUDED.evidence,
         jurisdiction_version = EXCLUDED.jurisdiction_version,
         -- A re-run re-opens verification: the row's facts may have moved, and
         -- §2 Stage 5 forbids publishing anything whose verification is stale.
         status = CASE WHEN ct_flags.status = 'retired' THEN 'retired' ELSE 'pending' END,
         updated_at = now()`,
      [
        x.holder.member, x.holder.party, x.holder.chamber, x.vendor.ticker,
        x.vendor.listedName || x.vendor.vendorName, x.award.awardKey, x.award.agency, x.award.subAgency,
        x.award.amount, x.award.actionDate, x.holder.tradeId, x.holder.tradeDate, x.holder.action,
        x.holder.tradeValue, x.seat.committee, x.seat.parent, x.seat.isSubcommittee, x.seat.role,
        x.seat.kind, x.seat.tableVersion, x.cts.score, JSON.stringify(x.cts.components),
        x.headline, JSON.stringify(evidence),
      ],
    );
  }

  /** Re-blend stored components against the current weights. Cheap: no source
   *  is re-read, because only the weighting changed. */
  async rescore(): Promise<number> {
    await this.ensureTables();
    const weights = await this.weights();
    const rows: any[] = await this.q(`SELECT id, components FROM ct_flags`);
    let n = 0;
    for (const r of rows) {
      const c = r.components || {};
      let num = 0;
      let den = 0;
      for (const [k, w] of Object.entries(weights)) {
        const v = c[k];
        if (v == null) continue;
        num += Number(v) * w;
        den += w;
      }
      const score = den > 0 ? Math.round((num / den) * 100) / 100 : null;
      await this.q(`UPDATE ct_flags SET score = $1, updated_at = now() WHERE id = $2`, [score, r.id]);
      n++;
    }
    return n;
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  /** The leaderboard. Only verified rows — §7 P2: "zero rows render without a
   *  passing verification timestamp". */
  async leaderboard(opts: {
    limit?: number;
    chamber?: string;
    party?: string;
    agency?: string;
    committee?: string;
    minScore?: number;
  } = {}) {
    await this.ensureTables();
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 250);
    const rows: any[] = await this.q(
      `SELECT id, member, party, chamber, ticker, company, agency, sub_agency,
              award_value::float8 AS award_value, award_date, trade_date, trade_action,
              trade_value::float8 AS trade_value, committee, role, score, components,
              headline, evidence, status, verified_at
         FROM ct_flags
        WHERE status = 'verified'
          AND ($1::text IS NULL OR chamber = $1)
          AND ($2::text IS NULL OR party = $2)
          AND ($3::text IS NULL OR agency = $3)
          AND ($4::text IS NULL OR committee = $4)
          AND ($5::float8 IS NULL OR score >= $5)
        ORDER BY score DESC NULLS LAST, award_value DESC
        LIMIT $6`,
      [
        opts.chamber || null, opts.party || null, opts.agency || null,
        opts.committee || null, opts.minScore ?? null, limit,
      ],
    );
    return rows.map(shape);
  }

  async forMember(member: string) {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT id, member, party, chamber, ticker, company, agency, sub_agency,
              award_value::float8 AS award_value, award_date, trade_date, trade_action,
              trade_value::float8 AS trade_value, committee, role, score, components,
              headline, evidence, status, verified_at
         FROM ct_flags
        WHERE status = 'verified' AND lower(member) = lower($1)
        ORDER BY score DESC NULLS LAST LIMIT 100`,
      [member],
    );
    return rows.map(shape);
  }

  async forTicker(ticker: string) {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT id, member, party, chamber, ticker, company, agency, sub_agency,
              award_value::float8 AS award_value, award_date, trade_date, trade_action,
              trade_value::float8 AS trade_value, committee, role, score, components,
              headline, evidence, status, verified_at
         FROM ct_flags
        WHERE status = 'verified' AND ticker = upper($1)
        ORDER BY score DESC NULLS LAST LIMIT 50`,
      [ticker],
    );
    return rows.map(shape);
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT count(*)::int AS flags,
              count(*) FILTER (WHERE status = 'verified')::int AS verified,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'retired')::int AS retired,
              count(DISTINCT member)::int AS members,
              count(DISTINCT ticker)::int AS tickers
         FROM ct_flags`,
    );
    return { ...c, weights: await this.weights() };
  }
}

function seatRank(h: { role: CommitteeRole; isSubcommittee: boolean; kind: string }): number {
  const role = h.role === 'chair' ? 4 : h.role === 'ranking' ? 3 : h.role === 'viceChair' ? 2 : 1;
  return role * 10 + (h.isSubcommittee ? 5 : 0) + (h.kind === 'appropriations' ? 2 : 0);
}

function shape(r: any) {
  return {
    id: Number(r.id),
    member: r.member,
    party: r.party,
    chamber: r.chamber,
    ticker: r.ticker,
    company: r.company,
    agency: r.sub_agency || r.agency,
    awardValue: r.award_value,
    awardDate: isoOf(r.award_date),
    tradeDate: isoOf(r.trade_date),
    tradeAction: r.trade_action,
    tradeValue: r.trade_value,
    committee: r.committee,
    role: r.role,
    score: r.score,
    components: r.components || {},
    headline: r.headline,
    evidence: r.evidence || {},
    verifiedAt: r.verified_at,
  };
}

function midpoint(min: number | null, max: number | null): number | null {
  if (min == null) return null;
  const hi = max ?? min;
  const v = (Number(min) + Number(hi)) / 2;
  return isFinite(v) ? v : null;
}

function isoOf(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
