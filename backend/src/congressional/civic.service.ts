import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

/** One sponsored/proposed bill (Congress.gov). */
export interface Legislation {
  title: string;
  number: string | null;
  introducedDate: string | null;
  latestActionDate: string | null;
  latestAction: string | null;
  url: string | null;
}

/** One itemized independent expenditure supporting/opposing a member (Sched E). */
export interface OutsideItem {
  committee: string;
  amount: number;
  date: string | null;
  filed: string | null;
}

/** One corporate PAC → committee contribution (FEC Schedule A non-individual).
 *  `ticker`/`companyName` are resolved downstream from the company table. */
export interface PacDonor {
  companyCommittee: string;
  recipientCommittee: string;
  amount: number;
  date: string | null;
  cycle: number | null;
  ticker?: string | null;
  companyName?: string | null;
}

/** Campaign-finance summary + top contributors (FEC). */
export interface Fundraising {
  cycle: number | null;
  totalReceipts: number | null;
  totalDisbursements: number | null;
  cashOnHand: number | null;
  topContributors: Array<{ name: string; amount: number }>;
}

/**
 * Civic data clients for politician profiles:
 *  - Congress.gov (sponsored legislation)  — key: CONGRESS_API_KEY
 *  - FEC / OpenFEC (campaign finance)       — key: FEC_API_KEY (api.data.gov)
 *
 * Both degrade to null/empty when their key is missing, so the profile still
 * renders (the UI shows a "connect this source" state). Name → id resolution
 * is cached in-memory for the process lifetime.
 */
@Injectable()
export class CivicService {
  private readonly log = new Logger(CivicService.name);
  private readonly http: AxiosInstance;
  private readonly congressKey = process.env.CONGRESS_API_KEY || '';
  private readonly fecKey = process.env.FEC_API_KEY || '';

  // name(lower) → resolved id (null = looked up, not found)
  private bioguideCache = new Map<string, string | null>();
  private fecIdCache = new Map<string, string | null>();
  private memberList: Array<{ name: string; bioguideId: string }> | null = null;

  constructor() {
    this.http = axios.create({
      timeout: 15000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': 'InsiderBuying/1.0', Accept: 'application/json' },
    });
  }

  get congressEnabled(): boolean {
    return !!this.congressKey;
  }
  get fecEnabled(): boolean {
    return !!this.fecKey;
  }

  private norm(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\b(jr|sr|ii|iii|iv|mr|mrs|dr|rep|sen)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Tokens (first + last) match, order-independent — handles "Dan Newhouse"
   *  vs "Newhouse, Dan". */
  private nameMatches(a: string, b: string): boolean {
    const ta = new Set(this.norm(a).split(' ').filter(Boolean));
    const tb = new Set(this.norm(b).split(' ').filter(Boolean));
    if (!ta.size || !tb.size) return false;
    let common = 0;
    for (const t of ta) if (tb.has(t)) common++;
    return common >= 2 || (ta.size === 1 && tb.has([...ta][0]));
  }

  // ── Congress.gov ──────────────────────────────────────────────────────
  private async loadMembers(): Promise<Array<{ name: string; bioguideId: string }>> {
    if (this.memberList) return this.memberList;
    const out: Array<{ name: string; bioguideId: string }> = [];
    try {
      for (let offset = 0; offset < 600; offset += 250) {
        const { data } = await this.http.get('https://api.congress.gov/v3/member', {
          params: { currentMember: true, limit: 250, offset, api_key: this.congressKey },
        });
        const members = data?.members || [];
        for (const m of members) {
          if (m.name && m.bioguideId) out.push({ name: m.name, bioguideId: m.bioguideId });
        }
        if (members.length < 250) break;
      }
    } catch (e: any) {
      this.log.warn(`Congress.gov member list failed: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    this.memberList = out;
    return out;
  }

  async resolveBioguide(name: string): Promise<string | null> {
    if (!this.congressEnabled) return null;
    const key = this.norm(name);
    if (this.bioguideCache.has(key)) return this.bioguideCache.get(key)!;
    const members = await this.loadMembers();
    const hit = members.find((m) => this.nameMatches(name, m.name));
    const id = hit?.bioguideId ?? null;
    this.bioguideCache.set(key, id);
    return id;
  }

  async getSponsoredLegislation(name: string): Promise<Legislation[]> {
    if (!this.congressEnabled) return [];
    const bioguide = await this.resolveBioguide(name);
    if (!bioguide) return [];
    try {
      const { data } = await this.http.get(
        `https://api.congress.gov/v3/member/${bioguide}/sponsored-legislation`,
        { params: { limit: 20, api_key: this.congressKey } },
      );
      const bills = data?.sponsoredLegislation || [];
      return bills
        .map((b: any): Legislation => ({
          title: b.title || `${b.type || ''} ${b.number || ''}`.trim() || 'Untitled',
          number: b.number ? `${b.type || ''} ${b.number}`.trim() : null,
          introducedDate: b.introducedDate || null,
          latestActionDate: b.latestAction?.actionDate || null,
          latestAction: b.latestAction?.text || null,
          url: b.url ? b.url.replace('api.congress.gov/v3', 'www.congress.gov') : null,
        }))
        .filter((b: Legislation) => b.title);
    } catch (e: any) {
      this.log.warn(`Congress.gov sponsored-legislation failed: ${e?.message || e}`);
      return [];
    }
  }

  // ── FEC / OpenFEC ─────────────────────────────────────────────────────
  private async fec(path: string, params: Record<string, any> = {}): Promise<any> {
    const { data } = await this.http.get(`https://api.open.fec.gov/v1${path}`, {
      params: { ...params, api_key: this.fecKey },
    });
    return data;
  }

  async resolveFecCandidate(name: string): Promise<string | null> {
    if (!this.fecEnabled) return null;
    const key = this.norm(name);
    if (this.fecIdCache.has(key)) return this.fecIdCache.get(key)!;
    let id: string | null = null;
    try {
      // FEC's `q` doesn't fuzzy-match a full "First M. Last" string and uses
      // nicknames (Jim vs James). Search by SURNAME, then score candidates by
      // surname + first-name/initial + House/Senate office.
      const tokens = this.norm(name).split(' ').filter((t) => t.length > 1);
      const surname = tokens[tokens.length - 1] || this.norm(name);
      const firstTok = tokens[0] || '';
      const data = await this.fec('/candidates/search/', {
        q: surname,
        sort: '-first_file_date',
        per_page: 30,
      });
      const results = data?.results || [];
      const scored = results
        .map((c: any) => {
          const ct = this.norm(c.name || '').split(' ').filter(Boolean); // "himes jim"
          const cLast = ct[0]; // FEC "LAST, FIRST" → first token is surname
          const cFirst = ct[1] || '';
          let score = 0;
          if (cLast === surname) score += 3;
          if (cFirst && firstTok && cFirst === firstTok) score += 3;
          else if (cFirst && firstTok && cFirst[0] === firstTok[0]) score += 1;
          if (c.office === 'H' || c.office === 'S') score += 1;
          return { c, score };
        })
        .filter((x: any) => x.score >= 3) // surname must match
        .sort((a: any, b: any) => b.score - a.score);
      id = scored[0]?.c?.candidate_id ?? results[0]?.candidate_id ?? null;
    } catch (e: any) {
      this.log.warn(`FEC candidate search failed: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    this.fecIdCache.set(key, id);
    return id;
  }

  async getFundraising(name: string): Promise<Fundraising | null> {
    if (!this.fecEnabled) return null;
    const candidateId = await this.resolveFecCandidate(name);
    if (!candidateId) return null;
    try {
      const totalsData = await this.fec(`/candidate/${candidateId}/totals/`, {
        sort: '-cycle',
        per_page: 1,
      });
      const t = totalsData?.results?.[0];
      if (!t) return null;
      // Note: FEC's by-employer aggregate isn't candidate-scoped and is
      // dominated by "RETIRED"/"NOT EMPLOYED" categories with market-wide
      // totals — not meaningful contributor names — so we omit it and show
      // only the accurate committee totals.
      return {
        cycle: t.cycle ?? null,
        totalReceipts: t.receipts != null ? Number(t.receipts) : null,
        totalDisbursements: t.disbursements != null ? Number(t.disbursements) : null,
        cashOnHand: t.last_cash_on_hand_end_period != null ? Number(t.last_cash_on_hand_end_period) : null,
        topContributors: [],
      };
    } catch (e: any) {
      this.log.warn(`FEC totals failed: ${e?.message || e}`);
      return null;
    }
  }

  /** Top corporate / PAC donors to the member's principal campaign committee
   *  (FEC Schedule A, non-individual contributions), aggregated by contributor.
   *  Real "Corporate Donors" data. Empty when no key / no committee. */
  async getCorporateDonors(name: string): Promise<Array<{ name: string; amount: number }>> {
    if (!this.fecEnabled) return [];
    const candidateId = await this.resolveFecCandidate(name);
    if (!candidateId) return [];
    try {
      const cData = await this.fec(`/candidate/${candidateId}/committees/`, { per_page: 20 });
      const committees = cData?.results || [];
      const principal =
        committees.find((c: any) => c.designation === 'P') || committees[0];
      if (!principal?.committee_id) return [];
      const sa = await this.fec('/schedules/schedule_a/', {
        committee_id: principal.committee_id,
        is_individual: false,
        sort: '-contribution_receipt_amount',
        per_page: 50,
      });
      const agg = new Map<string, number>();
      for (const r of sa?.results || []) {
        const nm = (r.contributor_name || '').trim();
        const amt = Number(r.contribution_receipt_amount) || 0;
        // Skip party/self transfers and refunds — keep real outside PAC money.
        if (!nm || amt <= 0) continue;
        agg.set(nm, (agg.get(nm) || 0) + amt);
      }
      return Array.from(agg.entries())
        .map(([n, amount]) => ({ name: n, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 15);
    } catch (e: any) {
      this.log.warn(`FEC corporate donors failed: ${e?.message || e}`);
      return [];
    }
  }

  /** Itemized outside-group independent expenditures SUPPORTING vs OPPOSING the
   *  member (FEC Schedule E). Powers the "Spending in Support/Opposition" chart
   *  (grouped by quarter downstream) AND the itemized Outside Spending table. */
  async getOutsideSpending(name: string): Promise<{
    supporters: OutsideItem[];
    opponents: OutsideItem[];
  }> {
    const empty = { supporters: [], opponents: [] };
    if (!this.fecEnabled) return empty;
    const candidateId = await this.resolveFecCandidate(name);
    if (!candidateId) return empty;
    const side = async (ind: 'S' | 'O'): Promise<OutsideItem[]> => {
      try {
        const data = await this.fec('/schedules/schedule_e/', {
          candidate_id: candidateId,
          support_oppose_indicator: ind,
          sort: '-expenditure_amount',
          per_page: 100,
        });
        return (data?.results || [])
          .map((r: any): OutsideItem => ({
            committee: (r.committee?.name || r.committee?.affiliated_committee_name || 'Unknown').trim(),
            amount: Number(r.expenditure_amount) || 0,
            date: (r.expenditure_date || r.dissemination_date || '')?.slice(0, 10) || null,
            filed: (r.receipt_date || r.expenditure_date || '')?.slice(0, 10) || null,
          }))
          .filter((x: OutsideItem) => x.amount > 0);
      } catch (e: any) {
        this.log.warn(`FEC schedule_e (${ind}) failed: ${e?.message || e}`);
        return [];
      }
    };
    const [supporters, opponents] = await Promise.all([side('S'), side('O')]);
    return { supporters, opponents };
  }

  /** Corporate PAC donors to the member's principal committee (FEC Schedule A
   *  non-individual) — Company Committee / Recipient Committee / Amount / Date /
   *  Cycle. Ticker is resolved downstream from the company table. */
  async getCorporatePacDonors(name: string): Promise<PacDonor[]> {
    if (!this.fecEnabled) return [];
    const candidateId = await this.resolveFecCandidate(name);
    if (!candidateId) return [];
    try {
      const cData = await this.fec(`/candidate/${candidateId}/committees/`, { per_page: 20 });
      const committees = cData?.results || [];
      const principal = committees.find((c: any) => c.designation === 'P') || committees[0];
      if (!principal?.committee_id) return [];
      const recipient = principal.name || 'Principal Committee';
      const sa = await this.fec('/schedules/schedule_a/', {
        committee_id: principal.committee_id,
        is_individual: false,
        sort: '-contribution_receipt_amount',
        per_page: 60,
      });
      return (sa?.results || [])
        .map((r: any): PacDonor => ({
          companyCommittee: (r.contributor_name || '').trim(),
          recipientCommittee: recipient,
          amount: Number(r.contribution_receipt_amount) || 0,
          date: (r.contribution_receipt_date || '')?.slice(0, 10) || null,
          cycle:
            r.two_year_transaction_period ??
            (r.contribution_receipt_date ? Number(r.contribution_receipt_date.slice(0, 4)) : null),
        }))
        .filter((x: PacDonor) => x.companyCommittee && x.amount > 0);
    } catch (e: any) {
      this.log.warn(`FEC corporate PAC donors failed: ${e?.message || e}`);
      return [];
    }
  }
}
