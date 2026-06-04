import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface IndexQuote {
  symbol: string;
  shortName: string;
  value: number;
  changePct: number;
  changeAbs: number;
}

const SYMBOLS: Array<{ symbol: string; shortName: string; fallback: IndexQuote }> = [
  { symbol: '^GSPC',   shortName: 'S&P 500',    fallback: { symbol: '^GSPC', shortName: 'S&P 500',   value: 5_950.43,  changePct:  0.42, changeAbs:  24.80 } },
  { symbol: '^IXIC',   shortName: 'Nasdaq',     fallback: { symbol: '^IXIC', shortName: 'Nasdaq',    value: 19_320.05, changePct:  0.61, changeAbs: 117.20 } },
  { symbol: '^DJI',    shortName: 'Dow Jones',  fallback: { symbol: '^DJI',  shortName: 'Dow Jones', value: 43_310.50, changePct:  0.18, changeAbs:  78.90 } },
  { symbol: '^NYA',    shortName: 'NYSE',       fallback: { symbol: '^NYA',  shortName: 'NYSE',      value: 19_805.10, changePct:  0.22, changeAbs:  43.10 } },
  { symbol: 'GC=F',    shortName: 'Gold',       fallback: { symbol: 'GC=F',  shortName: 'Gold',      value:  2_345.80, changePct:  0.34, changeAbs:   7.90 } },
  { symbol: 'SI=F',    shortName: 'Silver',     fallback: { symbol: 'SI=F',  shortName: 'Silver',    value:     29.85, changePct: -0.21, changeAbs:  -0.06 } },
  { symbol: 'BTC-USD', shortName: 'Bitcoin',    fallback: { symbol: 'BTC-USD', shortName: 'Bitcoin', value: 71_420.00, changePct:  1.18, changeAbs: 832.50 } },
];

@Injectable()
export class IndicesService {
  private readonly logger = new Logger(IndicesService.name);
  private readonly http: AxiosInstance;
  private cache: { ts: number; data: IndexQuote[] } | null = null;
  private readonly CACHE_MS = 60_000;

  constructor() {
    this.http = axios.create({
      timeout: 5_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        Accept: 'application/json',
      },
    });
  }

  private fallback(): IndexQuote[] {
    return SYMBOLS.map((s) => s.fallback);
  }

  async getQuotes(): Promise<IndexQuote[]> {
    if (this.cache && Date.now() - this.cache.ts < this.CACHE_MS) return this.cache.data;
    const symbols = SYMBOLS.map((s) => s.symbol).join(',');
    try {
      const { data } = await this.http.get(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
      );
      const raw: any[] = data?.quoteResponse?.result || [];
      const out: IndexQuote[] = SYMBOLS.map((def) => {
        const r = raw.find((x: any) => x?.symbol === def.symbol);
        if (!r) return def.fallback;
        const value = Number(r.regularMarketPrice ?? r.preMarketPrice ?? def.fallback.value);
        const changeAbs = Number(r.regularMarketChange ?? def.fallback.changeAbs);
        const changePct = Number(r.regularMarketChangePercent ?? def.fallback.changePct);
        return {
          symbol: def.symbol,
          shortName: def.shortName,
          value,
          changeAbs,
          changePct,
        };
      });
      this.cache = { ts: Date.now(), data: out };
      return out;
    } catch (err: any) {
      this.logger.warn(`Yahoo indices fetch failed: ${err?.message || err}. Using fallback.`);
      const out = this.fallback();
      this.cache = { ts: Date.now(), data: out };
      return out;
    }
  }
}
