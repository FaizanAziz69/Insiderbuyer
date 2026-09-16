import { Injectable, Logger } from '@nestjs/common';
import { FmpService } from '../fmp/fmp.service';

/**
 * Trade volume through the GERMAN venues for a Canadian venture issuer.
 *
 * George (2026-09-16): "Volume by exchange (add Germany) — I want to see the
 * stock volume coming through German exchange post IR campaign." TSXV / CSE
 * juniors are routinely dual-quoted in Frankfurt, Stuttgart, Tradegate,
 * gettex, LS Exchange, Quotrix, Munich, Düsseldorf, Hamburg and Berlin, and a
 * German retail wave is one of the visible footprints of a promotion.
 *
 * Source: onvista's public instrument API, addressed by ISIN. It lists every
 * notation (venue) of an instrument with its `idNotation`, and serves a daily
 * EOD series per notation with volume. FMP carries NO German line for any of
 * these issuers (checked 2026-09-16: 0 of 44 in its stock list), Yahoo and
 * Börse Frankfurt refuse requests from AWS, so onvista is the one source that
 * answers from the server. Volumes are summed across all German venues per
 * session; the per-venue totals are kept so the page can name where the
 * shares actually traded.
 *
 * Failure mode is silence: a network error or an unknown ISIN yields `null`
 * and a note; nothing here can break the price refresh that calls it.
 */

export interface GermanBar {
  date: string; // YYYY-MM-DD (UTC)
  volume: number; // shares, summed across German venues
}

export interface GermanVolume {
  isin: string | null;
  venues: Array<{ code: string; name: string; volume: number }>; // over the fetched range
  bars: GermanBar[];
  note: string | null;
}

const BASE = 'https://api.onvista.de/api/v1';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
// Venue codes onvista uses for German exchanges and German OTC venues. `@DE`
// rows are bank quote streams (Baader, Lang & Schwarz, SocGen) with no volume
// and are ignored; the exchange-side of Lang & Schwarz is LSX.
const GERMAN_CODES = new Set(['FRA', 'STU', 'GER', 'ETR', 'XETRA', 'GAT', 'TRO', 'LSX', 'QUO', 'MUN', 'DUS', 'HAM', 'HAN', 'BER']);
const PAUSE_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STOP = new Set(['inc', 'corp', 'corporation', 'ltd', 'limited', 'plc', 'co', 'company', 'the', 'holdings', 'group', 'and', 'of']);
/** Distinctive lower-case words of a company name, corporate suffixes dropped. */
export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w)),
  );
}

@Injectable()
export class GermanVolumeService {
  private readonly log = new Logger(GermanVolumeService.name);
  private readonly cache = new Map<string, { ts: number; data: GermanVolume }>();
  private readonly TTL_MS = 6 * 3600_000;

  constructor(private readonly fmp: FmpService) {}

  private async getJson(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${BASE}/${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e: any) {
      this.log.debug(`onvista ${path}: ${e?.message || e}`);
      return null;
    }
  }

  /** ISIN for an FMP symbol, via `search-exchange-variants` (the profile
   *  endpoint carries it too but our wrapper strips it). */
  async resolveIsin(fmpSymbol: string | null | undefined, issuerName?: string | null, ticker?: string | null): Promise<string | null> {
    if (fmpSymbol) {
      const viaFmp = await this.fmp.getIsin(fmpSymbol);
      if (viaFmp) return viaFmp;
    }
    // FMP has no symbol for roughly half of these juniors; onvista's search
    // knows most of them by name. Accept a STOCK hit whose name shares the
    // distinctive words of ours (corporate suffixes stripped), or whose
    // listed symbol is our ticker.
    const name = (issuerName || '').trim();
    if (!name) return null;
    await sleep(PAUSE_MS);
    const q = await this.getJson(`instruments/query?searchValue=${encodeURIComponent(name)}`);
    const want = nameTokens(name);
    const tick = (ticker || '').toUpperCase();
    const hits: any[] = (q?.list || []).filter((x: any) => x?.entityType === 'STOCK' && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(x?.isin || '')));
    for (const h of hits) {
      const got = nameTokens(String(h.name || ''));
      const overlap = [...want].filter((w) => got.has(w)).length;
      const symbolMatch = tick && String(h.symbol || '').toUpperCase() === tick;
      if (symbolMatch || (want.size && overlap === want.size) || (want.size >= 2 && overlap >= 2)) return String(h.isin).toUpperCase();
    }
    return null;
  }

  /**
   * Daily German-venue volume for one ISIN from `fromIso` to today, summed
   * across venues. Cached six hours: the nightly refresh asks once per issuer.
   */
  async fetch(isin: string, fromIso: string): Promise<GermanVolume> {
    const key = `${isin}:${fromIso}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.ts < this.TTL_MS) return hit.data;

    const empty = (note: string): GermanVolume => ({ isin, venues: [], bars: [], note });
    const q = await this.getJson(`instruments/query?searchValue=${encodeURIComponent(isin)}`);
    const inst = (q?.list || []).find((x: any) => x?.entityType === 'STOCK' && String(x?.isin || '').toUpperCase() === isin.toUpperCase())
      || (q?.list || []).find((x: any) => x?.entityType === 'STOCK');
    if (!inst?.entityValue) return empty('Not quoted on a German exchange.');
    await sleep(PAUSE_MS);

    const snap = await this.getJson(`stocks/${inst.entityValue}/snapshot`);
    const quotes: any[] = snap?.quoteList?.list || [];
    const notations = quotes
      .map((x) => ({
        code: String(x?.market?.codeExchange || ''),
        name: String(x?.market?.name || x?.market?.nameExchange || ''),
        idNotation: x?.market?.idNotation,
        country: String(x?.market?.isoCountry || ''),
      }))
      .filter((n) => n.idNotation && (GERMAN_CODES.has(n.code) || (n.country === 'DE' && !n.code.startsWith('@'))));
    if (!notations.length) return empty('Not quoted on a German exchange.');

    // One year of history covers the 120-day baseline plus a 90-day window
    // for any contract signed in the last eight months; older contracts get
    // whatever the range holds, and the caller only reports elapsed windows.
    const byDate = new Map<string, number>();
    const venues: GermanVolume['venues'] = [];
    for (const n of notations) {
      await sleep(PAUSE_MS);
      const e = await this.getJson(
        `instruments/STOCK/${inst.entityValue}/eod_history?idNotation=${n.idNotation}&range=Y1&startDate=${fromIso}`,
      );
      const ts: number[] = e?.datetimeLast || [];
      const vol: Array<number | null> = e?.volume || [];
      let total = 0;
      ts.forEach((t, i) => {
        const v = Number(vol[i]) || 0;
        if (v <= 0) return;
        const date = new Date(t * 1000).toISOString().slice(0, 10);
        if (date < fromIso) return;
        byDate.set(date, (byDate.get(date) || 0) + v);
        total += v;
      });
      if (total > 0) venues.push({ code: n.code, name: n.name, volume: total });
    }
    venues.sort((a, b) => b.volume - a.volume);
    const bars = [...byDate.entries()].map(([date, volume]) => ({ date, volume })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const data: GermanVolume = {
      isin,
      venues,
      bars,
      note: bars.length ? null : `Quoted in Germany (${notations.map((n) => n.name).join(', ')}) but no shares traded there in this period.`,
    };
    this.cache.set(key, { ts: Date.now(), data });
    return data;
  }
}
