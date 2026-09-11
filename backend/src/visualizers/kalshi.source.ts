import axios, { AxiosInstance } from 'axios';

/**
 * Kalshi — the second prediction-market source (§7.2, and §12 Q5's
 * "Polymarket first, Kalshi fast-follow"). George asked for it directly:
 * "look into the Polymarket or Kalshi APIs, they give them all for free".
 *
 * Reads need no key. Everything here normalises into the same MarketContract
 * the Polymarket poller produces, so the field, the panel and the movers feed
 * do not know or care which venue a bubble came from.
 *
 * One honest wrinkle, surfaced in the panel and the methodology: Polymarket
 * publishes dollar volume, Kalshi publishes contract counts. A Kalshi contract
 * settles at $1, so dollars traded are approximated as contracts × last price.
 * That is an approximation and is labelled as one wherever it is shown.
 */

const API = 'https://api.elections.kalshi.com/trade-api/v2';

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  status?: string;
  close_time?: string;
  volume_fp?: string | number;
  volume_24h_fp?: string | number;
  open_interest_fp?: string | number;
  last_price_dollars?: string | number;
  previous_price_dollars?: string | number;
  yes_bid_dollars?: string | number;
  yes_ask_dollars?: string | number;
}

export interface KalshiEvent {
  event_ticker: string;
  series_ticker?: string;
  title?: string;
  category?: string;
  markets?: KalshiMarket[];
}

/** Kalshi's own category names → the suite's five chips (§7.1). */
export function kalshiCategory(
  category?: string,
): 'Politics' | 'Economy' | 'Crypto' | 'Sports' | 'Tech & Science' | 'Other' {
  switch ((category ?? '').toLowerCase()) {
    case 'economics':
    case 'financials':
    case 'companies':
      return 'Economy';
    case 'elections':
    case 'politics':
    case 'world':
      return 'Politics';
    case 'crypto':
      return 'Crypto';
    case 'sports':
      return 'Sports';
    case 'science and technology':
      return 'Tech & Science';
    default:
      return 'Other';
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Contracts × last price. See the note at the top of this file. */
export function kalshiDollarVolume(m: KalshiMarket, contracts: number): number {
  const price = num(m.last_price_dollars) ?? 0.5;
  return contracts * Math.max(0.02, price);
}

export class KalshiClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      timeout: 60_000,
      headers: { Accept: 'application/json', 'User-Agent': 'InsiderBuying-Visualizers/1.0' },
    });
  }

  /**
   * Open events with their markets nested. This is the only listing that
   * carries a category AND populated volumes — the flat /markets feed returns
   * tens of thousands of freshly minted parlay legs with zero volume first.
   */
  async events(pages = 4): Promise<KalshiEvent[]> {
    let cursor = '';
    const out: KalshiEvent[] = [];
    for (let i = 0; i < pages; i++) {
      const { data } = await this.http.get<{ events?: KalshiEvent[]; cursor?: string }>(
        `${API}/events`,
        {
          params: {
            limit: 200,
            status: 'open',
            with_nested_markets: true,
            ...(cursor ? { cursor } : {}),
          },
        },
      );
      const evs = data?.events ?? [];
      if (evs.length === 0) break;
      out.push(...evs);
      cursor = data?.cursor ?? '';
      if (!cursor) break;
    }
    return out;
  }

  /** Refresh a specific set of market tickers. */
  async markets(tickers: string[]): Promise<KalshiMarket[]> {
    const out: KalshiMarket[] = [];
    for (let i = 0; i < tickers.length; i += 50) {
      const slice = tickers.slice(i, i + 50);
      const { data } = await this.http.get<{ markets?: KalshiMarket[] }>(`${API}/markets`, {
        params: { tickers: slice.join(','), limit: slice.length },
      });
      if (Array.isArray(data?.markets)) out.push(...data.markets);
    }
    return out;
  }

  /** Daily closes for the sparkline; Kalshi needs the series ticker too. */
  async history(
    seriesTicker: string,
    ticker: string,
    days = 30,
  ): Promise<{ t: number; p: number }[]> {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86_400;
    const { data } = await this.http.get<{
      candlesticks?: { end_period_ts: number; price?: { close_dollars?: string } }[];
    }>(`${API}/series/${encodeURIComponent(seriesTicker)}/markets/${encodeURIComponent(ticker)}/candlesticks`, {
      params: { start_ts: start, end_ts: end, period_interval: 60 },
    });
    return (data?.candlesticks ?? [])
      .map((c) => ({ t: c.end_period_ts, p: num(c.price?.close_dollars) ?? 0 }))
      .filter((c) => c.p > 0);
  }

  async trades(ticker: string, limit = 50) {
    const { data } = await this.http.get<{
      trades?: {
        created_time?: string;
        count_fp?: string;
        yes_price_dollars?: string;
        taker_side?: string;
        taker_outcome_side?: string;
      }[];
    }>(`${API}/markets/trades`, { params: { ticker, limit } });
    return (data?.trades ?? []).map((t) => {
      const price = num(t.yes_price_dollars) ?? 0;
      const count = num(t.count_fp) ?? 0;
      return {
        side: (t.taker_side ?? '').toLowerCase() === 'no' ? 'SELL' : 'BUY',
        sizeUsd: count * price,
        price,
        ts: Math.floor(new Date(t.created_time ?? Date.now()).getTime() / 1000),
        outcome: (t.taker_outcome_side ?? 'yes').toUpperCase() === 'NO' ? 'No' : 'Yes',
      };
    });
  }
}
