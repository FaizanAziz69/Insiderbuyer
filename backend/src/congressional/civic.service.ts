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
      const data = await this.fec('/candidates/search/', {
        q: name,
        sort: '-first_file_date',
        per_page: 20,
      });
      const results = data?.results || [];
      const hit =
        results.find((c: any) => this.nameMatches(name, c.name || '')) || results[0];
      id = hit?.candidate_id ?? null;
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
      // Top contributors (employers) — best-effort; empty on error/plan limits.
      let topContributors: Array<{ name: string; amount: number }> = [];
      try {
        const contribData = await this.fec('/schedules/schedule_a/by_employer/', {
          candidate_id: candidateId,
          cycle: t.cycle,
          per_page: 8,
          sort: '-total',
        });
        topContributors = (contribData?.results || [])
          .map((c: any) => ({ name: c.employer || 'Unknown', amount: Number(c.total) || 0 }))
          .filter((c: { name: string; amount: number }) => c.amount > 0);
      } catch {
        /* contributor breakdown unavailable on this plan — totals still shown */
      }
      return {
        cycle: t.cycle ?? null,
        totalReceipts: t.receipts != null ? Number(t.receipts) : null,
        totalDisbursements: t.disbursements != null ? Number(t.disbursements) : null,
        cashOnHand: t.last_cash_on_hand_end_period != null ? Number(t.last_cash_on_hand_end_period) : null,
        topContributors,
      };
    } catch (e: any) {
      this.log.warn(`FEC totals failed: ${e?.message || e}`);
      return null;
    }
  }
}
