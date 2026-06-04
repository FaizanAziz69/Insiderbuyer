import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface MarketStatRow {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
}

const FALLBACK_GAINERS: MarketStatRow[] = [
  { symbol: 'PLTR', name: 'Palantir Technologies', price:  88.42, changeAbs:  6.10, changePct:  7.41, volume: 142_000_000, avgVolume:  92_000_000, marketCap: 198_000_000_000, sector: 'Technology' },
  { symbol: 'SMCI', name: 'Super Micro Computer',  price: 612.50, changeAbs: 42.30, changePct:  7.42, volume:  29_500_000, avgVolume:  22_000_000, marketCap:  35_500_000_000, sector: 'Technology' },
  { symbol: 'MRNA', name: 'Moderna',               price:  87.15, changeAbs:  5.85, changePct:  7.19, volume:  18_200_000, avgVolume:  14_300_000, marketCap:  33_400_000_000, sector: 'Healthcare' },
  { symbol: 'COIN', name: 'Coinbase Global',       price: 312.80, changeAbs: 19.20, changePct:  6.54, volume:  12_800_000, avgVolume:   9_400_000, marketCap:  78_900_000_000, sector: 'Financial Services' },
  { symbol: 'MSTR', name: 'MicroStrategy',         price: 415.60, changeAbs: 24.40, changePct:  6.24, volume:   8_900_000, avgVolume:   7_100_000, marketCap:  72_300_000_000, sector: 'Technology' },
  { symbol: 'AMD',  name: 'Advanced Micro Devices',price: 168.42, changeAbs:  9.20, changePct:  5.78, volume:  82_000_000, avgVolume:  58_000_000, marketCap: 272_000_000_000, sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',          price: 145.30, changeAbs:  7.65, changePct:  5.56, volume: 380_000_000, avgVolume: 260_000_000, marketCap:3_550_000_000_000, sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla',                 price: 322.15, changeAbs: 16.40, changePct:  5.36, volume: 122_000_000, avgVolume:  98_000_000, marketCap:1_020_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'AVGO', name: 'Broadcom',              price: 192.05, changeAbs:  9.10, changePct:  4.97, volume:  31_500_000, avgVolume:  24_000_000, marketCap: 895_000_000_000, sector: 'Technology' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings',  price: 415.20, changeAbs: 18.60, changePct:  4.69, volume:   7_400_000, avgVolume:   5_800_000, marketCap: 102_000_000_000, sector: 'Technology' },
];

const FALLBACK_LOSERS: MarketStatRow[] = [
  { symbol: 'LULU', name: 'Lululemon Athletica',   price: 215.40, changeAbs: -19.30, changePct: -8.22, volume: 14_200_000, avgVolume:  9_800_000, marketCap:  26_500_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'WBA',  name: 'Walgreens Boots Alliance', price: 9.42, changeAbs: -0.78, changePct: -7.65, volume: 28_500_000, avgVolume: 22_000_000, marketCap:   8_100_000_000, sector: 'Healthcare' },
  { symbol: 'BBY',  name: 'Best Buy',              price:  76.30, changeAbs:  -5.40, changePct: -6.61, volume:  9_600_000, avgVolume:  6_900_000, marketCap:  16_400_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'INTC', name: 'Intel Corp.',           price:  21.05, changeAbs:  -1.32, changePct: -5.90, volume: 98_400_000, avgVolume: 72_000_000, marketCap:  90_500_000_000, sector: 'Technology' },
  { symbol: 'BA',   name: 'Boeing Co.',            price: 152.60, changeAbs:  -8.40, changePct: -5.22, volume: 14_700_000, avgVolume: 10_200_000, marketCap: 115_000_000_000, sector: 'Industrials' },
  { symbol: 'PFE',  name: 'Pfizer',                price:  28.42, changeAbs:  -1.43, changePct: -4.79, volume: 38_900_000, avgVolume: 31_000_000, marketCap: 161_000_000_000, sector: 'Healthcare' },
  { symbol: 'F',    name: 'Ford Motor',            price:   9.85, changeAbs:  -0.46, changePct: -4.46, volume: 62_400_000, avgVolume: 48_000_000, marketCap:  39_200_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'TGT',  name: 'Target Corp.',          price: 124.80, changeAbs:  -5.60, changePct: -4.30, volume:  8_900_000, avgVolume:  6_400_000, marketCap:  57_500_000_000, sector: 'Consumer Staples' },
  { symbol: 'NKE',  name: 'Nike Inc.',             price:  68.40, changeAbs:  -2.90, changePct: -4.07, volume: 12_300_000, avgVolume:  9_700_000, marketCap: 102_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'CVS',  name: 'CVS Health',            price:  56.20, changeAbs:  -2.30, changePct: -3.93, volume: 11_800_000, avgVolume:  8_900_000, marketCap:  70_500_000_000, sector: 'Healthcare' },
];

const FALLBACK_MOST_ACTIVE: MarketStatRow[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.',          price: 145.30, changeAbs:  7.65, changePct:  5.56, volume: 380_000_000, avgVolume: 260_000_000, marketCap: 3_550_000_000_000, sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla',                 price: 322.15, changeAbs: 16.40, changePct:  5.36, volume: 122_000_000, avgVolume:  98_000_000, marketCap: 1_020_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'AAPL', name: 'Apple Inc.',            price: 232.80, changeAbs:  1.20, changePct:  0.52, volume: 112_000_000, avgVolume:  85_000_000, marketCap: 3_540_000_000_000, sector: 'Technology' },
  { symbol: 'AMD',  name: 'Advanced Micro Devices',price: 168.42, changeAbs:  9.20, changePct:  5.78, volume:  82_000_000, avgVolume:  58_000_000, marketCap:   272_000_000_000, sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com',            price: 212.40, changeAbs:  3.10, changePct:  1.48, volume:  68_500_000, avgVolume:  54_000_000, marketCap: 2_230_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'F',    name: 'Ford Motor',            price:   9.85, changeAbs: -0.46, changePct: -4.46, volume:  62_400_000, avgVolume:  48_000_000, marketCap:    39_200_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'INTC', name: 'Intel Corp.',           price:  21.05, changeAbs: -1.32, changePct: -5.90, volume:  98_400_000, avgVolume:  72_000_000, marketCap:    90_500_000_000, sector: 'Technology' },
  { symbol: 'BAC',  name: 'Bank of America',       price:  44.20, changeAbs:  0.85, changePct:  1.96, volume:  54_200_000, avgVolume:  42_000_000, marketCap:   332_000_000_000, sector: 'Financial Services' },
  { symbol: 'PLTR', name: 'Palantir Technologies', price:  88.42, changeAbs:  6.10, changePct:  7.41, volume: 142_000_000, avgVolume:  92_000_000, marketCap:   198_000_000_000, sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms',        price: 612.40, changeAbs:  4.80, changePct:  0.79, volume:  18_500_000, avgVolume:  14_700_000, marketCap: 1_550_000_000_000, sector: 'Communication Services' },
];

type ScrId = 'day_gainers' | 'day_losers' | 'most_actives';

@Injectable()
export class MarketStatsService {
  private readonly logger = new Logger(MarketStatsService.name);
  private readonly http: AxiosInstance;
  private cache: Partial<Record<ScrId, { ts: number; data: MarketStatRow[] }>> = {};
  private readonly CACHE_MS = 60_000;

  constructor() {
    this.http = axios.create({
      timeout: 6_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        Accept: 'application/json',
      },
    });
  }

  private fallback(scrId: ScrId): MarketStatRow[] {
    if (scrId === 'day_gainers') return FALLBACK_GAINERS;
    if (scrId === 'day_losers') return FALLBACK_LOSERS;
    return FALLBACK_MOST_ACTIVE;
  }

  private async fetchScreener(scrId: ScrId, limit = 20): Promise<MarketStatRow[]> {
    const cached = this.cache[scrId];
    if (cached && Date.now() - cached.ts < this.CACHE_MS) return cached.data;
    try {
      const { data } = await this.http.get(
        `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${limit}&scrIds=${scrId}`,
      );
      const quotes: any[] = data?.finance?.result?.[0]?.quotes || [];
      if (!quotes.length) throw new Error('Empty quotes');
      const out: MarketStatRow[] = quotes.map((q: any) => ({
        symbol: String(q.symbol || ''),
        name: String(q.shortName || q.longName || q.symbol || ''),
        price: Number(q.regularMarketPrice ?? 0),
        changeAbs: Number(q.regularMarketChange ?? 0),
        changePct: Number(q.regularMarketChangePercent ?? 0),
        volume: Number(q.regularMarketVolume ?? 0),
        avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
        marketCap: q.marketCap != null ? Number(q.marketCap) : null,
        sector: q.sector ?? null,
      }));
      this.cache[scrId] = { ts: Date.now(), data: out };
      return out;
    } catch (err: any) {
      this.logger.warn(
        `Yahoo screener ${scrId} failed: ${err?.message || err}. Using fallback.`,
      );
      const out = this.fallback(scrId);
      this.cache[scrId] = { ts: Date.now(), data: out };
      return out;
    }
  }

  getTopGainers(limit = 20) {
    return this.fetchScreener('day_gainers', limit);
  }
  getTopLosers(limit = 20) {
    return this.fetchScreener('day_losers', limit);
  }
  getMostActive(limit = 20) {
    return this.fetchScreener('most_actives', limit);
  }

  async getQuoteBatch(symbols: string[]): Promise<Map<string, MarketStatRow>> {
    const map = new Map<string, MarketStatRow>();
    if (!symbols.length) return map;
    const unique = Array.from(new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())));
    if (!unique.length) return map;
    try {
      const { data } = await this.http.get(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(unique.join(','))}`,
      );
      const quotes: any[] = data?.quoteResponse?.result || [];
      for (const q of quotes) {
        const sym = String(q.symbol || '').toUpperCase();
        if (!sym) continue;
        map.set(sym, {
          symbol: sym,
          name: String(q.shortName || q.longName || sym),
          price: Number(q.regularMarketPrice ?? 0),
          changeAbs: Number(q.regularMarketChange ?? 0),
          changePct: Number(q.regularMarketChangePercent ?? 0),
          volume: Number(q.regularMarketVolume ?? 0),
          avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
          marketCap: q.marketCap != null ? Number(q.marketCap) : null,
          sector: q.sector ?? null,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Yahoo quote batch failed: ${err?.message || err}.`);
    }
    return map;
  }
}
