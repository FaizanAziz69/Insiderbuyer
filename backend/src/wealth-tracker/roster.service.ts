import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';

/**
 * Who is a member. Current members plus recent former ones (a term ending
 * on or after FORMER_SINCE), from the public @unitedstates legislators files
 * — the same source the rest of the congress stack uses — with the fields the
 * tracker's filters need: party, chamber, state, birthday (age brackets), and
 * the public-domain portrait keyed by bioguide.
 *
 * `added_at` is set once and never rewritten: the roster-governance rule
 * (badges and grades run from add-date forward) needs the date a person
 * entered the tracker, not the date the row was last refreshed.
 */

const CURRENT_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const HISTORICAL_URL = 'https://unitedstates.github.io/congress-legislators/legislators-historical.json';
/** A former member is kept while any source could still hold their trades.
 *  Widened to 2013 for the House Clerk archive (2014-2017 PTRs): a filer who
 *  left in 2016 still has to be in the roster for their filings to resolve. */
export const FORMER_SINCE = '2013-01-01';

export interface MemberRow {
  bioguide: string;
  name: string;
  first: string;
  last: string;
  nickname: string | null;
  chamber: 'House' | 'Senate';
  party: 'D' | 'R' | 'I' | null;
  state: string | null;
  district: string | null;
  birthday: string | null;
  current: boolean;
  term_start: string | null;
  term_end: string | null;
  photo_url: string;
}

function partyOf(raw: string | undefined): 'D' | 'R' | 'I' | null {
  const p = String(raw || '').toLowerCase();
  if (p.startsWith('dem')) return 'D';
  if (p.startsWith('rep')) return 'R';
  if (p) return 'I';
  return null;
}

export function toMemberRow(m: any, current: boolean): MemberRow | null {
  const bioguide = m?.id?.bioguide;
  const term = m?.terms?.[m.terms.length - 1];
  if (!bioguide || !term) return null;
  const chamber = term.type === 'sen' ? 'Senate' : term.type === 'rep' ? 'House' : null;
  if (!chamber) return null;
  const first = String(m?.name?.first || '').trim();
  const last = String(m?.name?.last || '').trim();
  return {
    bioguide: String(bioguide),
    name: String(m?.name?.official_full || `${first} ${last}`).trim(),
    first,
    last,
    nickname: m?.name?.nickname ? String(m.name.nickname) : null,
    chamber,
    party: partyOf(term.party),
    state: term.state || null,
    district: term.district != null ? String(term.district) : null,
    birthday: m?.bio?.birthday || null,
    current,
    term_start: term.start || null,
    term_end: term.end || null,
    photo_url: `https://unitedstates.github.io/images/congress/450x550/${bioguide}.jpg`,
  };
}

export function ageOn(birthday: string | null, on = new Date()): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return null;
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export type AgeBracket = 'lt50' | '50-64' | '65-74' | '75plus';
export function ageBracket(age: number | null): AgeBracket | null {
  if (age == null) return null;
  if (age < 50) return 'lt50';
  if (age < 65) return '50-64';
  if (age < 75) return '65-74';
  return '75plus';
}

@Injectable()
export class RosterService {
  private readonly log = new Logger(RosterService.name);

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS wt_members (
      bioguide text PRIMARY KEY,
      name text NOT NULL,
      first text NOT NULL DEFAULT '',
      last text NOT NULL DEFAULT '',
      nickname text,
      chamber text NOT NULL,
      party text,
      state text,
      district text,
      birthday date,
      current boolean NOT NULL DEFAULT true,
      term_start date,
      term_end date,
      photo_url text,
      fmp_name text,
      tracked_since date,
      added_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_members_fmp_name_idx ON wt_members (lower(fmp_name))`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_members_last_idx ON wt_members (lower(last))`);
  }

  private async fetchJson(url: string): Promise<any[]> {
    const res = await fetch(url, { headers: { 'User-Agent': 'InsiderBuyingBot/1.0' } });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  /** Load / refresh the roster. Returns how many rows were written. */
  async refresh(): Promise<{ current: number; former: number }> {
    await this.ensureTables();
    const [current, historical] = await Promise.all([this.fetchJson(CURRENT_URL), this.fetchJson(HISTORICAL_URL)]);
    const rows: MemberRow[] = [];
    for (const m of current) {
      const r = toMemberRow(m, true);
      if (r) rows.push(r);
    }
    const currentIds = new Set(rows.map((r) => r.bioguide));
    let former = 0;
    for (const m of historical) {
      const end = m?.terms?.[m.terms.length - 1]?.end || '';
      if (end < FORMER_SINCE) continue;
      const r = toMemberRow(m, false);
      if (!r || currentIds.has(r.bioguide)) continue;
      rows.push(r);
      former++;
    }
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values: any[] = [];
      const tuples = chunk.map((r, k) => {
        const b = k * 14;
        values.push(
          r.bioguide, r.name, r.first, r.last, r.nickname, r.chamber, r.party, r.state, r.district,
          r.birthday, r.current, r.term_start, r.term_end, r.photo_url,
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`;
      });
      await this.q(
        `INSERT INTO wt_members (bioguide,name,first,last,nickname,chamber,party,state,district,birthday,current,term_start,term_end,photo_url)
         VALUES ${tuples.join(',')}
         ON CONFLICT (bioguide) DO UPDATE SET
           name = EXCLUDED.name, first = EXCLUDED.first, last = EXCLUDED.last, nickname = EXCLUDED.nickname,
           chamber = EXCLUDED.chamber, party = EXCLUDED.party, state = EXCLUDED.state, district = EXCLUDED.district,
           birthday = EXCLUDED.birthday, current = EXCLUDED.current, term_start = EXCLUDED.term_start,
           term_end = EXCLUDED.term_end, photo_url = EXCLUDED.photo_url, updated_at = now()`,
        values,
      );
    }
    this.log.log(`Roster: ${rows.length - former} current + ${former} former members.`);
    return { current: rows.length - former, former };
  }

  async all(): Promise<Array<MemberRow & { fmp_name: string | null; tracked_since: string | null; added_at: string }>> {
    await this.ensureTables();
    return this.q(`SELECT bioguide, name, first, last, nickname, chamber, party, state, district,
      to_char(birthday,'YYYY-MM-DD') AS birthday, current,
      to_char(term_start,'YYYY-MM-DD') AS term_start, to_char(term_end,'YYYY-MM-DD') AS term_end,
      photo_url, fmp_name, to_char(tracked_since,'YYYY-MM-DD') AS tracked_since, added_at
      FROM wt_members ORDER BY last, first`);
  }

  /** Distinct surnames — one FMP by-name call each covers every member sharing it. */
  async surnames(): Promise<string[]> {
    const rows = await this.q<Array<{ last: string }>>(`SELECT DISTINCT last FROM wt_members WHERE last <> '' ORDER BY last`);
    return rows.map((r) => r.last);
  }

  async setFmpName(bioguide: string, fmpName: string): Promise<void> {
    await this.q(`UPDATE wt_members SET fmp_name = COALESCE(fmp_name, $2), updated_at = now() WHERE bioguide = $1`, [bioguide, fmpName]);
  }

  /** Resolve the profile URL's name (the legacy "First Last" from FMP) or a bioguide. */
  async resolve(nameOrBioguide: string): Promise<string | null> {
    const s = (nameOrBioguide || '').trim();
    if (!s) return null;
    if (/^[A-Z]\d{6}$/.test(s)) return s;
    const rows = await this.q<Array<{ bioguide: string }>>(
      `SELECT bioguide FROM wt_members
       WHERE lower(fmp_name) = lower($1) OR lower(name) = lower($1)
          OR lower(first || ' ' || last) = lower($1) OR lower(coalesce(nickname,'') || ' ' || last) = lower($1)
       ORDER BY current DESC LIMIT 1`,
      [s],
    );
    return rows[0]?.bioguide || null;
  }
}
