import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Company } from '../entities/company.entity';
import { committeeKey } from '../congress-trades/jurisdiction';

/**
 * What Congress has SCHEDULED — the missing half of Brief v9 §3's Legislative
 * Catalyst multiplier.
 *
 * §3: "× 1.10 when a buying member's committee has pending markup/hearing
 * activity on legislation affecting the company's sector." §9 assigns it
 * "Faizan scopes, editorial populates". This is the scoping half: we hold
 * 3,892 committee seats and 27 committees with agency jurisdiction, and
 * nothing at all about what those committees have scheduled.
 *
 * THE RULE THIS FEEDS, AND WHY IT IS THE NARROW ONE
 *
 * The brief's wording — "legislation affecting the company's sector" — needs a
 * bill-to-sector mapping, and that is an editorial judgement, not a lookup. A
 * defence appropriations bill and Lockheed is obvious; a data-privacy bill and
 * Microsoft is an opinion. Rather than encode an opinion, the multiplier fires
 * only where the committee with scheduled activity is the SAME committee that
 * already holds jurisdiction over an agency awarding this company contracts.
 * That is a join, it needs nobody to maintain it, and it cannot assert a
 * connection we cannot evidence. It fires rarely, which is the right trade for
 * a published score.
 *
 * COVERAGE, STATED HONESTLY
 *
 * The Senate publishes its schedule as XML with no key and that is live here.
 * The House does not: docs.house.gov is an ASP.NET postback page with no
 * structured feed, and every alternative checked (floor downloads, the
 * majority leader's feed, congress.gov RSS) returns HTML or 404. The House
 * therefore needs api.congress.gov, which is free but requires a key. Until
 * `CONGRESS_API_KEY` is set the House half simply does not load, and
 * `coverage` on the status route says so rather than implying full coverage.
 */

const SENATE_XML = 'https://www.senate.gov/general/committee_schedules/hearings.xml';
const CONGRESS_API = 'https://api.congress.gov/v3';
/** A hearing this far ahead is not "pending activity" in any useful sense. */
const HORIZON_DAYS = 45;

export interface ScheduleRow {
  chamber: 'Senate' | 'House';
  committee: string;
  committeeKey: string;
  date: string;
  matter: string | null;
  sourceUrl: string | null;
}

/**
 * Keys come from the Brief v5 influence map's own `committeeKey`, not a second
 * normaliser. It strips chamber words, so "Judiciary" from the Senate feed and
 * "Senate Committee on the Judiciary" in ct_jurisdiction land on the same key —
 * which is the whole point, since the seat and the schedule have to join.
 * Chamber is kept as its own column rather than folded into the key, so a
 * caller can still require that a House seat match House activity.
 */

@Injectable()
export class LegislativeCalendarService implements OnModuleInit {
  private readonly log = new Logger(LegislativeCalendarService.name);
  private ready = false;
  private readonly http: AxiosInstance = axios.create({
    timeout: 45_000,
    headers: { 'User-Agent': 'InsiderBuying/1.0 (devs@insiderbuying.com)' },
  });

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
    } catch (e: any) {
      this.log.warn(`legislative-calendar init failed: ${e?.message || e}`);
    }
  }

  /** Schedules move daily; 06:40 UTC is before the CQS recompute at 06:10+. */
  @Cron('40 5 * * *')
  async daily(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.refresh().catch((e) => this.log.warn(`refresh failed: ${e?.message || e}`));
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS committee_schedule (
      id            bigserial PRIMARY KEY,
      chamber       text NOT NULL,
      committee     text NOT NULL,
      committee_key text NOT NULL,
      event_date    date NOT NULL,
      matter        text,
      source_url    text,
      fetched_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (chamber, committee_key, event_date, matter)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS committee_schedule_key ON committee_schedule (committee_key, event_date)`);
    this.ready = true;
  }

  /* ------------------------------------------------------------ sources */

  /** The Senate's own XML. No key, one call, already structured. */
  private async fetchSenate(): Promise<ScheduleRow[]> {
    const out: ScheduleRow[] = [];
    const { data } = await this.http.get<string>(SENATE_XML, { responseType: 'text' });
    const xml = String(data || '');
    const field = (block: string, tag: string): string => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    for (const m of xml.matchAll(/<meeting>([\s\S]*?)<\/meeting>/g)) {
      const block = m[1];
      const committee = field(block, 'committee');
      const date = field(block, 'date_iso_8601');
      const matter = field(block, 'matter');
      // The feed carries a placeholder row on empty days; it is not a meeting.
      if (!committee || !date || /^no committee hearings/i.test(matter)) continue;
      out.push({
        chamber: 'Senate',
        committee,
        committeeKey: committeeKey(committee),
        date,
        matter: matter || null,
        sourceUrl: SENATE_XML,
      });
    }
    return out;
  }

  /**
   * The House, via api.congress.gov. Needs a free key; without one this
   * returns nothing and the caller reports partial coverage rather than
   * pretending the House had no meetings.
   */
  private async fetchHouse(): Promise<ScheduleRow[]> {
    const key = process.env.CONGRESS_API_KEY;
    if (!key) return [];
    const out: ScheduleRow[] = [];
    try {
      const { data } = await this.http.get(`${CONGRESS_API}/committee-meeting`, {
        params: { format: 'json', limit: 250, api_key: key },
      });
      for (const m of data?.committeeMeetings || []) {
        const detail = m?.committee?.name || m?.committees?.[0]?.name || '';
        const chamber = String(m?.chamber || 'House');
        if (chamber !== 'House') continue;
        const date = String(m?.date || m?.updateDate || '').slice(0, 10);
        if (!detail || !date) continue;
        out.push({
          chamber: 'House',
          committee: detail,
          committeeKey: committeeKey(detail),
          date,
          matter: m?.title || null,
          sourceUrl: m?.url || null,
        });
      }
    } catch (e: any) {
      this.log.warn(`House schedule fetch failed: ${e?.message || e}`);
    }
    return out;
  }

  /* ------------------------------------------------------------ refresh */

  async refresh(): Promise<unknown> {
    await this.ensureTables();
    const started = Date.now();
    const senate = await this.fetchSenate().catch((e) => {
      this.log.warn(`Senate schedule fetch failed: ${e?.message || e}`);
      return [] as ScheduleRow[];
    });
    const house = await this.fetchHouse();
    const rows = [...senate, ...house];

    let written = 0;
    for (const r of rows) {
      await this.q(
        `INSERT INTO committee_schedule (chamber, committee, committee_key, event_date, matter, source_url, fetched_at)
         VALUES ($1,$2,$3,$4::date,$5,$6, now())
         ON CONFLICT (chamber, committee_key, event_date, matter) DO UPDATE SET fetched_at = now()`,
        [r.chamber, r.committee, r.committeeKey, r.date, r.matter, r.sourceUrl],
      );
      written++;
    }
    // A meeting that has happened is no longer "pending".
    await this.q(`DELETE FROM committee_schedule WHERE event_date < current_date - 1`);

    const out = {
      senate: senate.length,
      house: house.length,
      written,
      houseEnabled: !!process.env.CONGRESS_API_KEY,
      ms: Date.now() - started,
    };
    this.log.log(`legislative calendar refreshed: ${JSON.stringify(out)}`);
    return out;
  }

  async status(): Promise<unknown> {
    await this.ensureTables();
    const [row] = await this.q<any[]>(
      `SELECT count(*)::int AS rows,
              count(*) FILTER (WHERE chamber = 'Senate')::int AS senate,
              count(*) FILTER (WHERE chamber = 'House')::int   AS house,
              count(DISTINCT committee_key)::int               AS committees,
              max(fetched_at)                                  AS fetched_at
         FROM committee_schedule
        WHERE event_date >= current_date`,
    );
    return {
      ...row,
      houseEnabled: !!process.env.CONGRESS_API_KEY,
      coverage: process.env.CONGRESS_API_KEY
        ? 'Senate and House'
        : 'Senate only — set CONGRESS_API_KEY (free, api.data.gov) to include the House',
    };
  }

  /**
   * Committee keys with activity scheduled between yesterday and the horizon.
   * The multiplier reads this and nothing else; whether that activity concerns
   * the company is decided by the jurisdiction join, not here.
   */
  async pendingCommitteeKeys(): Promise<Set<string>> {
    await this.ensureTables();
    const rows = await this.q<any[]>(
      `SELECT DISTINCT committee_key FROM committee_schedule
        WHERE event_date BETWEEN current_date - 1 AND current_date + $1::int`,
      [HORIZON_DAYS],
    );
    return new Set(rows.map((r) => r.committee_key));
  }

  /** Upcoming rows for one committee, for the evidence popover on a score. */
  async forCommittee(committee: string, chamber = 'Senate'): Promise<ScheduleRow[]> {
    await this.ensureTables();
    const rows = await this.q<any[]>(
      `SELECT chamber, committee, committee_key, event_date::text AS date, matter, source_url
         FROM committee_schedule
        WHERE committee_key = $1 AND event_date >= current_date - 1
        ORDER BY event_date LIMIT 20`,
      [committeeKey(committee)],
    );
    return rows.map((r) => ({
      chamber: r.chamber,
      committee: r.committee,
      committeeKey: r.committee_key,
      date: r.date,
      matter: r.matter,
      sourceUrl: r.source_url,
    }));
  }
}
