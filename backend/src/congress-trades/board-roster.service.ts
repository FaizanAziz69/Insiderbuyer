import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import { AwardsService } from './awards.service';
import { EntityResolutionService } from './entity-resolution.service';
import { agencyKey } from './jurisdiction';
import { checkCopy } from './cts';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 4: politicians on boards.
 *
 * "[politician P on board of company C] AND [C awarded contract by agency A]
 * AND [P previously served in / oversaw A, or currently holds office with
 * jurisdiction]. Requires a service-history field per person (offices held,
 * agencies led, committee history)."
 *
 * The roster is EDITORIAL, not scraped, and that is a deliberate reading of
 * the brief rather than a shortcut. §6 names DEF 14A and 8-K as the sources,
 * and those documents do identify directors — but whether a given director is
 * "a politician or senior official" and which agency they "previously served
 * in or oversaw" is a judgement about a person's career, made from their
 * biography. Guessing it from a proxy statement would put a claim about a
 * named individual on a public page on the strength of a string match, which
 * is the one thing §5 forbids.
 *
 * So: this service owns the roster, its service history and the flags; the
 * admin owns who goes in it. Every person carries the citation that put them
 * there, and it travels into the evidence chain like every other leg.
 */

const UA = process.env.SEC_USER_AGENT || 'InsiderBuying devs@insiderbuying.com';

export interface ServiceEntry {
  /** "Secretary of Defense", "Senator (Armed Services)", "Administrator, EPA" */
  office: string;
  /** USAspending agency names this office ran or had jurisdiction over. */
  agencies: string[];
  from: string | null;
  to: string | null;
}

@Injectable()
export class BoardRosterService {
  private readonly log = new Logger(BoardRosterService.name);
  private ready = false;
  private cikCache: { ts: number; byTicker: Map<string, string> } | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly awards: AwardsService,
    private readonly vendors: EntityResolutionService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_officials (
      slug            varchar(96) PRIMARY KEY,
      name            text NOT NULL,
      /* Current or former office-holder; a sitting member can also sit on a
         board, and §4's flag condition allows either. */
      still_serving   boolean NOT NULL DEFAULT false,
      service_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      source          text,
      created_by      varchar(64),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS ct_board_seats (
      id          bigserial PRIMARY KEY,
      slug        varchar(96) NOT NULL,
      ticker      varchar(16) NOT NULL,
      company     text,
      role        varchar(64) NOT NULL DEFAULT 'Director',
      since       date,
      until       date,
      /* The filing that evidences the seat — DEF 14A or 8-K (§6). */
      source_url  text,
      source_form varchar(16),
      created_by  varchar(64),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS ct_board_seats_uniq
      ON ct_board_seats (slug, ticker, COALESCE(since, '1900-01-01'::date))`);

    // §6 sources the roster "from DEF 14A proxy statements and 8-K director
    // appointments". Those filings are what this table holds: PROPOSALS for a
    // human to read, never roster entries. Nothing here reaches a public page
    // until an editor moves it into ct_officials by hand.
    await this.q(`CREATE TABLE IF NOT EXISTS ct_board_candidates (
      id            bigserial PRIMARY KEY,
      ticker        varchar(16) NOT NULL,
      cik           varchar(12),
      form          varchar(16) NOT NULL,
      filing_date   date,
      filing_url    text NOT NULL,
      candidate_name text,
      context       text,
      state         varchar(16) NOT NULL DEFAULT 'pending',
      reviewed_by   varchar(64),
      reviewed_at   timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS ct_board_candidates_uniq
      ON ct_board_candidates (filing_url, COALESCE(lower(candidate_name), ''))`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_board_candidates_state_idx ON ct_board_candidates (state)`);
    this.ready = true;
  }

  // ── Roster admin ───────────────────────────────────────────────────────

  async upsertOfficial(o: {
    name: string;
    stillServing?: boolean;
    serviceHistory?: ServiceEntry[];
    source?: string;
  }, actor: string) {
    await this.ensureTables();
    const slug = slugify(o.name);
    if (!slug) return null;
    await this.q(
      `INSERT INTO ct_officials (slug, name, still_serving, service_history, source, created_by, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6, now())
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, still_serving = EXCLUDED.still_serving,
         service_history = EXCLUDED.service_history, source = COALESCE(EXCLUDED.source, ct_officials.source),
         updated_at = now()`,
      [slug, o.name, !!o.stillServing, JSON.stringify(o.serviceHistory ?? []), o.source ?? null, actor],
    );
    return { slug };
  }

  async upsertSeat(s: {
    name: string;
    ticker: string;
    company?: string;
    role?: string;
    since?: string | null;
    until?: string | null;
    sourceUrl?: string;
    sourceForm?: string;
  }, actor: string) {
    await this.ensureTables();
    const slug = slugify(s.name);
    if (!slug || !s.ticker) return null;
    await this.q(
      `INSERT INTO ct_board_seats (slug, ticker, company, role, since, until, source_url, source_form, created_by, updated_at)
       VALUES ($1,upper($2),$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (slug, ticker, COALESCE(since, '1900-01-01'::date)) DO UPDATE SET
         company = COALESCE(EXCLUDED.company, ct_board_seats.company),
         role = EXCLUDED.role, until = EXCLUDED.until,
         source_url = COALESCE(EXCLUDED.source_url, ct_board_seats.source_url),
         source_form = COALESCE(EXCLUDED.source_form, ct_board_seats.source_form),
         updated_at = now()`,
      [slug, s.ticker, s.company ?? null, s.role ?? 'Director', s.since ?? null, s.until ?? null,
       s.sourceUrl ?? null, s.sourceForm ?? null, actor],
    );
    return { slug, ticker: s.ticker.toUpperCase() };
  }

  async roster(limit = 200) {
    await this.ensureTables();
    return this.q(
      `SELECT o.slug, o.name, o.still_serving, o.service_history, o.source,
              COALESCE(json_agg(json_build_object(
                'ticker', b.ticker, 'company', b.company, 'role', b.role,
                'since', b.since, 'until', b.until, 'sourceUrl', b.source_url, 'form', b.source_form
              )) FILTER (WHERE b.id IS NOT NULL), '[]'::json) AS seats
         FROM ct_officials o
         LEFT JOIN ct_board_seats b ON b.slug = o.slug
        GROUP BY o.slug, o.name, o.still_serving, o.service_history, o.source
        ORDER BY o.name LIMIT $1`,
      [limit],
    );
  }

  // ── The second flag type ───────────────────────────────────────────────

  /**
   * A board seat becomes a flag when the company wins an award from an agency
   * the director previously ran or oversaw.
   *
   * The seat must be CURRENT at the award date. A director who left the board
   * two years before the contract is not a proximity — including them would
   * inflate the leaderboard with relationships that had already ended.
   */
  async run(days = 180): Promise<{ awards: number; flags: number }> {
    await this.ensureTables();
    const awards = await this.awards.recent(days);
    let flags = 0;

    for (const award of awards) {
      const vendor = await this.vendors.lookup(award.recipientUei, award.recipientName);
      if (!vendor || vendor.status !== 'ticker' || !vendor.ticker) continue;

      const seats: any[] = await this.q(
        `SELECT b.slug, b.ticker, b.company, b.role, b.since, b.until, b.source_url, b.source_form,
                o.name, o.service_history, o.still_serving
           FROM ct_board_seats b JOIN ct_officials o ON o.slug = b.slug
          WHERE b.ticker = $1
            AND (b.since IS NULL OR b.since <= $2::date)
            AND (b.until IS NULL OR b.until >= $2::date)`,
        [vendor.ticker, award.actionDate],
      );

      for (const seat of seats) {
        const history: ServiceEntry[] = seat.service_history || [];
        const agencyKeys = new Set(
          [agencyKey(award.agency), agencyKey(award.subAgency || '')].filter(Boolean),
        );
        const match = history.find((h) => (h.agencies || []).some((a) => agencyKeys.has(agencyKey(a))));
        if (!match) continue;

        const headline =
          `${seat.name} serves as ${seat.role} of ${seat.company || vendor.listedName || vendor.vendorName} ` +
          `(${vendor.ticker}). ${seat.name} previously served as ${match.office}, ` +
          `which covers the ${award.subAgency || award.agency}. That agency awarded ` +
          `$${Math.round(award.amount / 1e6)}M to the company on ${award.actionDate}.`;
        const copy = checkCopy(headline);
        if (!copy.ok) {
          this.log.error(`board headline rejected for ${seat.name}: ${copy.violations.map((v) => v.term).join(', ')}`);
          continue;
        }

        const evidence = {
          boardSeat: {
            source: seat.source_form || 'SEC filing',
            url: seat.source_url,
            role: seat.role,
            since: isoOf(seat.since),
            until: isoOf(seat.until),
          },
          serviceHistory: { office: match.office, from: match.from, to: match.to, agencies: match.agencies },
          award: {
            source: 'USAspending.gov',
            awardId: award.awardId,
            url: `https://www.usaspending.gov/award/${encodeURIComponent(award.awardKey)}`,
            agency: award.agency,
            subAgency: award.subAgency,
            amount: award.amount,
            actionDate: award.actionDate,
          },
          vendorResolution: { method: vendor.method, chain: vendor.evidence },
        };

        await this.q(
          `INSERT INTO ct_flags
             (flag_type, member, ticker, company, award_key, agency, sub_agency, award_value, award_date,
              committee, role, headline, evidence, status, updated_at)
           VALUES ('board',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'pending', now())
           ON CONFLICT (member, award_key, ticker, COALESCE(trade_date, '1900-01-01'::date), committee)
           DO UPDATE SET award_value = EXCLUDED.award_value, headline = EXCLUDED.headline,
                         evidence = EXCLUDED.evidence,
                         status = CASE WHEN ct_flags.status = 'retired' THEN 'retired' ELSE 'pending' END,
                         updated_at = now()`,
          [
            seat.name, vendor.ticker, seat.company || vendor.listedName, award.awardKey,
            award.agency, award.subAgency, award.amount, award.actionDate,
            // The "committee" column carries the office for a board flag, so
            // one table holds both flag types without a second schema.
            match.office, 'member', headline, JSON.stringify(evidence),
          ],
        );
        flags++;
      }
    }
    this.log.log(`board flags: ${awards.length} awards scanned, ${flags} flags`);
    return { awards: awards.length, flags };
  }

  // ── Assisted import from the filings (§2 Stage 4, §6) ─────────────────

  /**
   * Find directors a company has named in its own filings, and propose them.
   *
   * §6 names DEF 14A and 8-K as the sources, and this reads exactly those: the
   * proxy statement, where the board is listed, and 8-K item 5.02, which is
   * the item a company files when it appoints a director.
   *
   * It writes to the CANDIDATES table and nowhere near the roster. Whether a
   * given director is a politician or senior official, and which agency they
   * once ran, is a judgement about a person's career; a name matched out of
   * HTML cannot make it, and a wrong guess here would put a claim about a
   * named individual onto a public page, which is the single thing §5
   * forbids. An editor reads the filing and decides.
   */
  async importCandidates(tickerRaw: string, maxFilings = 12): Promise<{
    ticker: string;
    cik: string | null;
    filings: number;
    candidates: number;
  }> {
    await this.ensureTables();
    const ticker = String(tickerRaw || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!ticker) return { ticker, cik: null, filings: 0, candidates: 0 };

    const cik = await this.cikFor(ticker);
    if (!cik) {
      this.log.warn(`no SEC CIK for ${ticker}`);
      return { ticker, cik: null, filings: 0, candidates: 0 };
    }

    let recent: any;
    try {
      const { data } = await axios.get(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        timeout: 25_000,
        headers: { 'User-Agent': UA },
      });
      recent = data?.filings?.recent;
    } catch (e: any) {
      this.log.warn(`SEC submissions failed for ${ticker}: ${e?.message || e}`);
      return { ticker, cik, filings: 0, candidates: 0 };
    }
    if (!recent?.form?.length) return { ticker, cik, filings: 0, candidates: 0 };

    let filings = 0;
    let candidates = 0;
    for (let i = 0; i < recent.form.length && filings < maxFilings; i++) {
      const form = String(recent.form[i] || '');
      const items = String(recent.items?.[i] || '');
      // 5.02 is "Departure/Election of Directors"; every other 8-K item is
      // somebody else's news.
      const wanted = form === 'DEF 14A' || (form === '8-K' && items.includes('5.02'));
      if (!wanted) continue;

      const accession = String(recent.accessionNumber[i] || '').replace(/-/g, '');
      const doc = String(recent.primaryDocument[i] || '');
      if (!accession || !doc) continue;
      const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${doc}`;
      filings++;

      const found = await this.namesIn(url, form);
      if (!found.length) {
        // Still worth proposing: an editor reading the proxy is the point, and
        // a filing we could not parse is exactly the one a person should open.
        await this.proposeCandidate(ticker, cik, form, recent.filingDate[i], url, null, null);
        candidates++;
        continue;
      }
      for (const f of found.slice(0, 12)) {
        await this.proposeCandidate(ticker, cik, form, recent.filingDate[i], url, f.name, f.context);
        candidates++;
      }
    }
    this.log.log(`board candidates for ${ticker}: ${filings} filings read, ${candidates} proposed`);
    return { ticker, cik, filings, candidates };
  }

  private async proposeCandidate(
    ticker: string, cik: string, form: string, filingDate: string,
    url: string, name: string | null, context: string | null,
  ) {
    await this.q(
      `INSERT INTO ct_board_candidates (ticker, cik, form, filing_date, filing_url, candidate_name, context)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (filing_url, COALESCE(lower(candidate_name), '')) DO NOTHING`,
      [ticker, cik, form, filingDate || null, url, name, context],
    );
  }

  /** Ticker to CIK, from SEC's own mapping file. */
  private async cikFor(ticker: string): Promise<string | null> {
    if (this.cikCache && Date.now() - this.cikCache.ts < 24 * 60 * 60 * 1000) {
      return this.cikCache.byTicker.get(ticker) ?? null;
    }
    try {
      const { data } = await axios.get('https://www.sec.gov/files/company_tickers.json', {
        timeout: 30_000,
        headers: { 'User-Agent': UA },
      });
      const byTicker = new Map<string, string>();
      for (const v of Object.values<any>(data || {})) {
        if (!v?.ticker || !v?.cik_str) continue;
        byTicker.set(String(v.ticker).toUpperCase(), String(v.cik_str).padStart(10, '0'));
      }
      this.cikCache = { ts: Date.now(), byTicker };
      return byTicker.get(ticker) ?? null;
    } catch (e: any) {
      this.log.warn(`SEC ticker file failed: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Best-effort person names out of a filing, with the sentence they sat in.
   *
   * Deliberately shallow. The context string is the useful part — it is what
   * an editor reads to decide — and a name with no context attached is still
   * only ever a proposal.
   */
  private async namesIn(url: string, form: string): Promise<Array<{ name: string; context: string }>> {
    let text = '';
    try {
      const { data } = await axios.get<string>(url, {
        timeout: 30_000,
        responseType: 'text',
        headers: { 'User-Agent': UA },
      });
      text = String(data)
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');
    } catch {
      return [];
    }
    if (!text) return [];

    const out: Array<{ name: string; context: string }> = [];
    const seen = new Set<string>();
    // A capitalised two-or-three word name sitting next to the language a
    // company uses when it names a director.
    const near =
      /((?:Mr\.|Ms\.|Mrs\.|Dr\.|Hon\.|General|Admiral|Senator|Representative|Secretary)?\s?[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)[^.]{0,120}?\b(?:as a director|to the Board of Directors|as a member of the Board|elected to the Board|appointed to the Board|has been appointed a director|joined the Board)/g;
    let m: RegExpExecArray | null;
    while ((m = near.exec(text)) && out.length < 25) {
      const name = m[1].replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.|Hon\.)\s*/, '').trim();
      const key = name.toLowerCase();
      if (key.length < 5 || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, context: `${form}: ${m[0].slice(0, 300)}` });
    }
    return out;
  }

  async candidates(state = 'pending', limit = 100) {
    await this.ensureTables();
    return this.q(
      `SELECT id, ticker, cik, form, filing_date, filing_url, candidate_name, context, state, created_at
         FROM ct_board_candidates
        WHERE state = $1
        ORDER BY filing_date DESC NULLS LAST, id DESC
        LIMIT $2`,
      [state, Math.min(Math.max(limit, 1), 500)],
    );
  }

  /** An editor dismissing a candidate should not see it again. Approving is
   *  deliberately NOT done here: it means writing a service history, which is
   *  `upsertOfficial` plus `upsertSeat` and a human's judgement. */
  async dismissCandidate(id: number, actor: string) {
    await this.ensureTables();
    await this.q(
      `UPDATE ct_board_candidates SET state = 'dismissed', reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
      [actor, id],
    );
    return { ok: true };
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT (SELECT count(*)::int FROM ct_officials) AS officials,
              (SELECT count(*)::int FROM ct_officials WHERE jsonb_array_length(service_history) > 0) AS with_history,
              (SELECT count(*)::int FROM ct_board_seats) AS seats,
              (SELECT count(*)::int FROM ct_board_candidates WHERE state = 'pending') AS pending_candidates`,
    );
    return c;
  }
}

function slugify(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function isoOf(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
