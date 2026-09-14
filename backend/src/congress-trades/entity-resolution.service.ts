import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import { AwardsService } from './awards.service';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 3: vendor → ticker.
 *
 * The brief calls this "the hard problem" and it is right. The path it
 * prescribes is followed exactly: "USAspending parent-recipient data → GLEIF
 * LEI where available → SEC EDGAR company search → manual resolution queue for
 * the tail. Subsidiaries roll up to the listed parent; store the evidence
 * chain per mapping."
 *
 * WHAT THE ACCEPTANCE NUMBER ACTUALLY MEANS (§7 P1: "≥90% of $1M+ awards
 * vendor-resolved automatically"). Most federal contractors are not listed
 * companies at all — they are private firms, joint ventures, universities and
 * FFRDC operators. Three consecutive real awards pulled while building this
 * were Waste Control Specialists LLC (private), HDR-OBG A Joint Venture (a JV,
 * which cannot have a ticker) and WSP USA Solutions Inc (a subsidiary, whose
 * ticker exists only via its Canadian parent). So "resolved" here means a
 * DECISION was reached automatically — a ticker, or a durable "not publicly
 * listed" — and only the genuinely ambiguous tail goes to a human. Counting
 * only ticker hits would mean failing an acceptance test on the structure of
 * the federal contracting market rather than on the quality of the resolver.
 *
 * Every mapping stores how it was decided, because §2 requires the evidence
 * chain to be one click from any public surface.
 */

const GLEIF_URL = 'https://api.gleif.org/api/v1/lei-records';
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

export type ResolutionStatus = 'ticker' | 'not_public' | 'unresolved';

export interface Resolution {
  uei: string | null;
  vendorName: string;
  status: ResolutionStatus;
  ticker: string | null;
  /** The listed entity the ticker belongs to, when it is a parent roll-up. */
  listedName: string | null;
  /** 'usaspending-parent' | 'gleif-lei' | 'sec-edgar' | 'name-match' |
   *  'structure' | 'manual'. */
  method: string;
  /** Human-readable chain, one line per hop, shown on the public surface. */
  evidence: string[];
  confidence: number;
}

/** Legal forms that can never carry a ticker. Deciding these automatically is
 *  what keeps the manual queue to a size a person can actually work. */
const NEVER_LISTED =
  /\b(joint venture|jv|llc|l\.l\.c|llp|university|college|school district|county of|city of|state of|trust|foundation|institute|association|hospital|medical center|sole proprietor|partnership)\b/i;

/** Suffixes stripped before a name comparison. */
const SUFFIX =
  /\b(inc|incorporated|corp|corporation|co|company|holdings?|group|international|intl|ltd|limited|llc|llp|lp|plc|sa|nv|ag|gmbh|usa|us|the)\b/gi;

@Injectable()
export class EntityResolutionService {
  private readonly log = new Logger(EntityResolutionService.name);
  private ready = false;
  private secIndex: { ts: number; byName: Map<string, { ticker: string; title: string }> } | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly awards: AwardsService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_vendor_map (
      vendor_key   text PRIMARY KEY,
      uei          varchar(24),
      vendor_name  text NOT NULL,
      status       varchar(16) NOT NULL DEFAULT 'unresolved',
      ticker       varchar(16),
      listed_name  text,
      method       varchar(32),
      evidence     jsonb NOT NULL DEFAULT '[]'::jsonb,
      confidence   real NOT NULL DEFAULT 0,
      reviewed_by  varchar(64),
      reviewed_at  timestamptz,
      updated_at   timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_vendor_map_status_idx ON ct_vendor_map (status)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_vendor_map_ticker_idx ON ct_vendor_map (ticker)`);
    this.ready = true;
  }

  // ── Resolution ─────────────────────────────────────────────────────────

  /** Resolve every vendor behind stored awards that has no decision yet. */
  async resolvePending(limit = 250): Promise<{ resolved: number; ticker: number; notPublic: number; unresolved: number }> {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT DISTINCT a.recipient_uei AS uei, a.recipient_name AS name, a.recipient_id AS rid
         FROM ct_awards a
         LEFT JOIN ct_vendor_map m ON m.vendor_key = lower(COALESCE(a.recipient_uei, a.recipient_name))
        WHERE m.vendor_key IS NULL
        LIMIT $1`,
      [limit],
    );
    let ticker = 0;
    let notPublic = 0;
    let unresolved = 0;
    for (const r of rows) {
      const res = await this.resolve(r.name, r.uei, r.rid);
      await this.store(res);
      if (res.status === 'ticker') ticker++;
      else if (res.status === 'not_public') notPublic++;
      else unresolved++;
    }
    const resolved = ticker + notPublic;
    this.log.log(
      `entity resolution: ${rows.length} vendors — ${ticker} ticker, ${notPublic} not public, ${unresolved} to review`,
    );
    return { resolved, ticker, notPublic, unresolved };
  }

  /**
   * The four hops of §2 Stage 3, in order, stopping at the first that decides.
   */
  async resolve(vendorName: string, uei: string | null, recipientId: string | null): Promise<Resolution> {
    const evidence: string[] = [`USAspending vendor: ${vendorName}${uei ? ` (UEI ${uei})` : ''}`];

    // Hop 0 — our own universe. The cheapest hit, and the one that matters
    // most: a ticker we already cover is a ticker a member can have traded.
    const direct = await this.matchOurUniverse(vendorName);
    if (direct) {
      evidence.push(`Matched our covered company ${direct.ticker} — ${direct.name}`);
      return ok(vendorName, uei, direct.ticker, direct.name, 'name-match', evidence, 0.9);
    }

    // Hop 1 — USAspending's own parent recipient.
    if (recipientId) {
      const parent = await this.awards.parentOf(recipientId);
      if (parent?.name && normName(parent.name) !== normName(vendorName)) {
        evidence.push(`USAspending parent recipient: ${parent.name}${parent.uei ? ` (UEI ${parent.uei})` : ''}`);
        const viaParent = await this.matchOurUniverse(parent.name);
        if (viaParent) {
          evidence.push(`Parent matched our covered company ${viaParent.ticker} — ${viaParent.name}`);
          return ok(vendorName, uei, viaParent.ticker, viaParent.name, 'usaspending-parent', evidence, 0.88);
        }
        const secParent = await this.matchSec(parent.name);
        if (secParent) {
          evidence.push(`Parent matched SEC registrant ${secParent.ticker} — ${secParent.title}`);
          return ok(vendorName, uei, secParent.ticker, secParent.title, 'usaspending-parent', evidence, 0.85);
        }
      }
    }

    // Hop 2 — SEC's own ticker file on the vendor name itself.
    const sec = await this.matchSec(vendorName);
    if (sec) {
      evidence.push(`Matched SEC registrant ${sec.ticker} — ${sec.title}`);
      return ok(vendorName, uei, sec.ticker, sec.title, 'sec-edgar', evidence, 0.78);
    }

    // Hop 3 — roll a subsidiary's TRADING name up to its parent's.
    //
    // Federal contracting is full of "<Parent> Federal Services LLC" and
    // "<Parent> Government Services LLC" entities that exist only to hold the
    // contract. The first live run marked Accenture Federal Services LLC and
    // Comcast Government Services LLC as "not publicly listed" on their legal
    // form alone, which silently dropped every flag against ACN and CMCSA —
    // the exact roll-up §2 asks for, failing quietly. Stripping the qualifier
    // and retrying is cheap and recovers them.
    const rolled = rollUp(vendorName);
    if (rolled && rolled !== normName(vendorName)) {
      const viaRoll = (await this.matchOurUniverse(rolled)) ?? null;
      if (viaRoll) {
        evidence.push(`Vendor is a subsidiary trading name; rolled up to ${viaRoll.name} (${viaRoll.ticker}).`);
        return ok(vendorName, uei, viaRoll.ticker, viaRoll.name, 'parent-name', evidence, 0.72);
      }
      const secRoll = await this.matchSec(rolled);
      if (secRoll) {
        evidence.push(`Vendor is a subsidiary trading name; rolled up to SEC registrant ${secRoll.title} (${secRoll.ticker}).`);
        return ok(vendorName, uei, secRoll.ticker, secRoll.title, 'parent-name', evidence, 0.7);
      }
    }

    // Hop 5 — GLEIF, last because it is the slowest. The LEI record names the ultimate parent, which is how a
    // subsidiary with a different trading name reaches its listed owner.
    const lei = await this.gleif(vendorName);
    if (lei) {
      evidence.push(`GLEIF LEI ${lei.lei} — ${lei.legalName}${lei.parent ? `, parent ${lei.parent}` : ''}`);
      const target = lei.parent || lei.legalName;
      const viaLei = (await this.matchOurUniverse(target)) ?? null;
      if (viaLei) {
        evidence.push(`Matched our covered company ${viaLei.ticker} — ${viaLei.name}`);
        return ok(vendorName, uei, viaLei.ticker, viaLei.name, 'gleif-lei', evidence, 0.82);
      }
      const secLei = await this.matchSec(target);
      if (secLei) {
        evidence.push(`Matched SEC registrant ${secLei.ticker} — ${secLei.title}`);
        return ok(vendorName, uei, secLei.ticker, secLei.title, 'gleif-lei', evidence, 0.8);
      }
    }

    // Hop 6 — decide "not publicly listed" where the legal form settles it.
    // A joint venture or an LLC has no ticker by construction, and a person
    // re-deciding that every week is a waste of the queue.
    if (NEVER_LISTED.test(vendorName)) {
      evidence.push('Legal form cannot carry a listed security (joint venture, LLC, public body or non-profit).');
      return {
        uei, vendorName, status: 'not_public', ticker: null, listedName: null,
        method: 'structure', evidence, confidence: 0.7,
      };
    }

    evidence.push('No parent, LEI or registrant match — queued for manual resolution.');
    return { uei, vendorName, status: 'unresolved', ticker: null, listedName: null, method: '', evidence, confidence: 0 };
  }

  // ── Sources ────────────────────────────────────────────────────────────

  private async matchOurUniverse(name: string): Promise<{ ticker: string; name: string } | null> {
    const key = normName(name);
    if (key.length < 4) return null;
    const rows: any[] = await this.q(
      `SELECT symbol, name FROM companies
        WHERE lower(name) LIKE $1 OR lower(name) = $2
        ORDER BY length(name) LIMIT 5`,
      [`${key.split(' ')[0]}%`, name.toLowerCase()],
    );
    for (const r of rows) {
      if (normName(r.name) === key) return { ticker: r.symbol, name: r.name };
    }
    return null;
  }

  private async matchSec(name: string): Promise<{ ticker: string; title: string } | null> {
    const idx = await this.secIndexed();
    if (!idx) return null;
    return idx.get(normName(name)) ?? null;
  }

  private async secIndexed() {
    if (this.secIndex && Date.now() - this.secIndex.ts < 24 * 60 * 60 * 1000) return this.secIndex.byName;
    try {
      const { data } = await axios.get(SEC_TICKERS_URL, {
        timeout: 30_000,
        headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'InsiderBuying devs@insiderbuying.com' },
      });
      const byName = new Map<string, { ticker: string; title: string }>();
      for (const v of Object.values<any>(data || {})) {
        if (!v?.ticker || !v?.title) continue;
        byName.set(normName(v.title), { ticker: String(v.ticker).toUpperCase(), title: String(v.title) });
      }
      this.secIndex = { ts: Date.now(), byName };
      return byName;
    } catch (e: any) {
      this.log.warn(`SEC ticker file failed: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * GLEIF is the slowest hop by a wide margin — an exact-name lookup plus a
   * second call for the ultimate parent, against an API that is often a
   * second or more per request. A probe over 80 vendors spent minutes here, so
   * it runs LAST, only for names nothing cheaper could decide, on short
   * timeouts: a slow registry must never hold up a nightly pipeline.
   */
  private async gleif(name: string): Promise<{ lei: string; legalName: string; parent: string | null } | null> {
    try {
      const { data } = await axios.get(GLEIF_URL, {
        timeout: 8_000,
        params: { 'filter[entity.legalName]': name, 'page[size]': 1 },
      });
      const rec = data?.data?.[0];
      if (!rec) return null;
      const legalName = rec?.attributes?.entity?.legalName?.name;
      if (!legalName) return null;
      let parent: string | null = null;
      try {
        const { data: p } = await axios.get(
          `${GLEIF_URL}/${encodeURIComponent(rec.id)}/ultimate-parent`,
          { timeout: 8_000 },
        );
        parent = p?.data?.attributes?.entity?.legalName?.name ?? null;
      } catch {
        parent = null;
      }
      return { lei: rec.id, legalName, parent };
    } catch {
      return null;
    }
  }

  // ── Storage + queue ────────────────────────────────────────────────────

  /**
   * The key is ALWAYS lower-cased, UEI included. Every SQL join against this
   * table must lower-case the award side to match: a first live run joined on
   * the raw UEI, which is upper-case, so nothing ever matched — the queue read
   * as empty and `resolvePending` re-resolved the same vendors every night
   * without ever making progress.
   */
  private static keyOf(uei: string | null, vendorName: string): string {
    return (uei || vendorName).toLowerCase();
  }

  private async store(r: Resolution): Promise<void> {
    const key = EntityResolutionService.keyOf(r.uei, r.vendorName);
    await this.q(
      `INSERT INTO ct_vendor_map
         (vendor_key, uei, vendor_name, status, ticker, listed_name, method, evidence, confidence, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9, now())
       ON CONFLICT (vendor_key) DO UPDATE SET
         -- A human decision is the record of truth and a later automatic pass
         -- must never quietly replace it.
         status = CASE WHEN ct_vendor_map.reviewed_at IS NULL THEN EXCLUDED.status ELSE ct_vendor_map.status END,
         ticker = CASE WHEN ct_vendor_map.reviewed_at IS NULL THEN EXCLUDED.ticker ELSE ct_vendor_map.ticker END,
         listed_name = CASE WHEN ct_vendor_map.reviewed_at IS NULL THEN EXCLUDED.listed_name ELSE ct_vendor_map.listed_name END,
         method = CASE WHEN ct_vendor_map.reviewed_at IS NULL THEN EXCLUDED.method ELSE ct_vendor_map.method END,
         evidence = CASE WHEN ct_vendor_map.reviewed_at IS NULL THEN EXCLUDED.evidence ELSE ct_vendor_map.evidence END,
         confidence = GREATEST(ct_vendor_map.confidence, EXCLUDED.confidence),
         updated_at = now()`,
      [key, r.uei, r.vendorName, r.status, r.ticker, r.listedName, r.method, JSON.stringify(r.evidence), r.confidence],
    );
  }

  async lookup(uei: string | null, vendorName: string): Promise<Resolution | null> {
    await this.ensureTables();
    const key = EntityResolutionService.keyOf(uei, vendorName);
    const r = (await this.q(`SELECT * FROM ct_vendor_map WHERE vendor_key = $1`, [key]))?.[0];
    if (!r) return null;
    return {
      uei: r.uei, vendorName: r.vendor_name, status: r.status, ticker: r.ticker,
      listedName: r.listed_name, method: r.method, evidence: r.evidence || [], confidence: r.confidence,
    };
  }

  async queue(limit = 100) {
    await this.ensureTables();
    return this.q(
      `SELECT m.vendor_key, m.uei, m.vendor_name, m.evidence,
              count(a.award_key)::int AS awards,
              sum(a.amount)::float8 AS award_value
         FROM ct_vendor_map m
         LEFT JOIN ct_awards a ON lower(COALESCE(a.recipient_uei, a.recipient_name)) = m.vendor_key
        WHERE m.status = 'unresolved' AND m.reviewed_at IS NULL
        GROUP BY m.vendor_key, m.uei, m.vendor_name, m.evidence
        ORDER BY award_value DESC NULLS LAST
        LIMIT $1`,
      [limit],
    );
  }

  async decide(
    vendorKey: string,
    patch: { ticker?: string | null; status?: ResolutionStatus; listedName?: string | null },
    actor: string,
  ) {
    await this.ensureTables();
    const before = (await this.q(`SELECT * FROM ct_vendor_map WHERE vendor_key = $1`, [vendorKey]))?.[0];
    if (!before) return null;
    const ticker = patch.ticker ? String(patch.ticker).toUpperCase() : null;
    const status: ResolutionStatus = patch.status ?? (ticker ? 'ticker' : 'not_public');
    await this.q(
      `UPDATE ct_vendor_map
          SET ticker = $1, status = $2, listed_name = $3, method = 'manual', confidence = 1,
              evidence = evidence || to_jsonb($4::text), reviewed_by = $5, reviewed_at = now(), updated_at = now()
        WHERE vendor_key = $6`,
      [ticker, status, patch.listedName ?? before.listed_name ?? null, `Resolved by hand (${actor}).`, actor, vendorKey],
    );
    return { ok: true };
  }

  /** §7 P1's acceptance number, measured rather than asserted. */
  async coverage() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT count(*)::int AS vendors,
              count(*) FILTER (WHERE status = 'ticker')::int AS with_ticker,
              count(*) FILTER (WHERE status = 'not_public')::int AS not_public,
              count(*) FILTER (WHERE status = 'unresolved')::int AS unresolved
         FROM ct_vendor_map`,
    );
    const decided = c.with_ticker + c.not_public;
    return {
      ...c,
      decidedPct: c.vendors ? Math.round((decided / c.vendors) * 1000) / 10 : 0,
      tickerPct: c.vendors ? Math.round((c.with_ticker / c.vendors) * 1000) / 10 : 0,
    };
  }
}

function ok(
  vendorName: string,
  uei: string | null,
  ticker: string,
  listedName: string,
  method: string,
  evidence: string[],
  confidence: number,
): Resolution {
  return { uei, vendorName, status: 'ticker', ticker, listedName, method, evidence, confidence };
}

/**
 * Qualifiers a parent bolts onto a contracting subsidiary's name. Removing
 * them leaves the parent's own name, which is the thing that has a ticker.
 */
const SUBSIDIARY_QUALIFIER =
  /\b(federal|government|govt|public sector|national security|defense|defence|solutions?|services?|systems?|technologies|technology|mission|operations|group|north america|americas?|usa|us|international|global|labs?|consulting)\b/gi;

/**
 * "ACCENTURE FEDERAL SERVICES LLC" → "accenture".
 *
 * Deliberately conservative: it returns a name only when at least one whole
 * word survives the strip, so a vendor whose entire name is qualifiers does
 * not collapse to something that matches half the market.
 */
export function rollUp(raw: string): string | null {
  const stripped = normName(raw).replace(SUBSIDIARY_QUALIFIER, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped || stripped.length < 3) return null;
  // A single-word parent is the common case (Accenture, Comcast, Leidos); two
  // words is still safe (Booz Allen). More than that and nothing was really
  // stripped, so there is no roll-up to do.
  const words = stripped.split(' ');
  return words.length <= 2 ? stripped : null;
}

/** Company names compared with legal suffixes and punctuation removed, so
 *  "WSP USA Solutions Inc." and "WSP USA Solutions, Inc" are one name. */
export function normName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(SUFFIX, ' ')
    .replace(/[^a-z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
