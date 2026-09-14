import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

/**
 * Maps a TRADED symbol onto the symbol its fundamentals are filed under.
 *
 * George 2026-09-14: "There are some stocks that we are not pulling the
 * financial data for properly especially the New IPO companies … Example
 * /companies/MFPVV. Stockanalysis has this data, so no reason we cant get it."
 *
 * He was right, and the cause was duller than a missing data source. MFPVV is
 * a temporary symbol — the exchange appends a suffix to a newly-listed line
 * (V for when-issued, W warrants, U units, R rights, and doubled variants
 * while several of those overlap). The company files, and our vendor carries,
 * everything under the CANONICAL symbol: MFP. We were asking for fundamentals
 * under a symbol no filer has ever used, getting an empty response, and
 * rendering an empty Financials tab.
 *
 *   /market-stats/statements?symbol=MFPVV → {income:[],balance:[],cashflow:[]}
 *   /market-stats/statements?symbol=MFP   → 10-Q rows, revenue $245.4M
 *
 * Resolution order, cheapest and safest first:
 *   1. The symbol is already in SEC's own ticker file → it IS canonical.
 *   2. Company NAME match against that file. We know the name from the live
 *      quote ("Midera Food Processing, Inc."), SEC lists it against MFP. This
 *      is the reliable path — it cannot invent a mapping.
 *   3. Trim one trailing suffix letter at a time and accept a candidate ONLY
 *      when SEC lists it AND the listed name matches the name we hold. The
 *      name check is what stops MFPVV silently resolving to some unrelated
 *      three-letter ticker.
 *
 * A resolution is a pure lookup — no new vendor, no cost. Callers treat it as
 * a hint: if the canonical symbol also returns nothing, nothing is lost.
 */

export interface ResolvedSymbol {
  /** The symbol to ask a fundamentals vendor for. */
  canonical: string;
  /** 10-digit CIK, for callers that want to go to EDGAR directly. */
  cik: string | null;
  /** Which rule produced it — carried into logs, never into a response. */
  via: 'self' | 'name' | 'suffix';
}

/** Exchange suffixes that ride on a temporary or non-common line. */
const SUFFIX_LETTERS = new Set(['V', 'W', 'U', 'R', 'D', 'Q']);
const MAX_TRIM = 2;

/** Normalise a company name hard enough that "Midera Food Processing, Inc."
 *  and "MIDERA FOOD PROCESSING INC" collapse to the same key. */
function nameKey(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|HOLDINGS?|GROUP|THE|CLASS [A-Z]|COMMON STOCK|ORDINARY SHARES?|SPONSORED ADR)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

@Injectable()
export class SymbolResolverService {
  private readonly logger = new Logger(SymbolResolverService.name);
  private readonly http: AxiosInstance;

  /** SEC's ticker file, indexed both ways. Refreshed daily — it is ~800 KB. */
  private byTicker: Map<string, { cik: string; name: string }> | null = null;
  private byName: Map<string, { cik: string; ticker: string }> | null = null;
  private loadedAt = 0;
  private loading: Promise<void> | null = null;
  private readonly TTL_MS = 24 * 60 * 60 * 1000;

  /** Resolutions already computed this process. */
  private readonly cache = new Map<string, ResolvedSymbol | null>();

  constructor() {
    this.http = axios.create({
      timeout: 20000,
      // Same reason as SecClient: Node intermittently resolves SEC hosts to
      // IPv6 and fails while IPv4 works.
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: {
        'User-Agent':
          process.env.SEC_USER_AGENT || 'InsiderBuying contact@insiderbuying.com',
        'Accept-Encoding': 'gzip, deflate',
      },
    });
  }

  private async load(): Promise<void> {
    if (this.byTicker && Date.now() - this.loadedAt < this.TTL_MS) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const { data } = await this.http.get(
          'https://www.sec.gov/files/company_tickers.json',
        );
        const byTicker = new Map<string, { cik: string; name: string }>();
        const byName = new Map<string, { cik: string; ticker: string }>();
        for (const k of Object.keys(data || {})) {
          const e = data[k];
          if (!e?.ticker || e?.cik_str == null) continue;
          const ticker = String(e.ticker).toUpperCase();
          const cik = String(e.cik_str).padStart(10, '0');
          const name = String(e.title || '');
          byTicker.set(ticker, { cik, name });
          const key = nameKey(name);
          // First listing wins: SEC orders the file by size, so the primary
          // line beats a later share class carrying the same name.
          if (key && !byName.has(key)) byName.set(key, { cik, ticker });
        }
        if (byTicker.size) {
          this.byTicker = byTicker;
          this.byName = byName;
          this.loadedAt = Date.now();
          this.cache.clear();
        }
      } catch (err: any) {
        this.logger.warn(`SEC ticker file unavailable: ${err?.message || err}`);
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /**
   * Resolve `symbol` to the symbol its filings live under.
   *
   * `companyName` comes from the live quote and is what makes rule 3 safe —
   * without it a suffix trim is only accepted when nothing else matched AND
   * the trimmed symbol is listed, which is deliberately conservative.
   * Returns null when the symbol already looks canonical or nothing matches.
   */
  async resolve(
    symbolRaw: string,
    companyName?: string | null,
  ): Promise<ResolvedSymbol | null> {
    const symbol = (symbolRaw || '').toUpperCase().trim();
    if (!symbol) return null;
    const cacheKey = `${symbol}|${nameKey(companyName || '')}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;

    await this.load();
    const byTicker = this.byTicker;
    const byName = this.byName;
    if (!byTicker || !byName) return null;

    let out: ResolvedSymbol | null = null;

    const self = byTicker.get(symbol);
    if (self) {
      // Already the filing symbol. Still worth returning so callers get a CIK.
      out = { canonical: symbol, cik: self.cik, via: 'self' };
    } else {
      const key = nameKey(companyName || '');
      const named = key ? byName.get(key) : undefined;
      if (named && named.ticker !== symbol) {
        out = { canonical: named.ticker, cik: named.cik, via: 'name' };
      } else {
        // Rule 3 — trim suffix letters, newest first.
        for (let n = 1; n <= MAX_TRIM && !out; n++) {
          if (symbol.length - n < 1) break;
          const dropped = symbol.slice(-n).toUpperCase();
          if (![...dropped].every((ch) => SUFFIX_LETTERS.has(ch))) continue;
          const candidate = symbol.slice(0, -n);
          const hit = byTicker.get(candidate);
          if (!hit) continue;
          // With a name in hand it must agree; without one, accept the listed
          // candidate — it is the only evidence available and the caller only
          // uses it to retry a lookup that already returned nothing.
          if (key && nameKey(hit.name) !== key) continue;
          out = { canonical: candidate, cik: hit.cik, via: 'suffix' };
        }
      }
    }

    if (out && out.canonical !== symbol) {
      this.logger.log(
        `Resolved ${symbol} → ${out.canonical} (cik ${out.cik}, via ${out.via})`,
      );
    }
    this.cache.set(cacheKey, out);
    return out;
  }

  /** Convenience: the canonical symbol, or the input when nothing resolved. */
  async canonicalSymbol(
    symbol: string,
    companyName?: string | null,
  ): Promise<string> {
    const r = await this.resolve(symbol, companyName);
    return r?.canonical || (symbol || '').toUpperCase();
  }
}
