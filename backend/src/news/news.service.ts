import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { XMLParser } from 'fast-xml-parser';

export type NewsCategory = 'Market' | 'Economy' | 'Funds' | 'Regulatory';
export type NewsRegion = 'US' | 'Canada';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  category: NewsCategory;
  region: NewsRegion;
  label: string;
  pubDate: string;
  tags: string[];
}

export const TAG_LABELS: Record<string, string> = {
  ai: 'AI',
  'analyst-ratings': 'Analyst Ratings',
  biotech: 'Biotech',
  dividends: 'Dividends',
  earnings: 'Earnings',
  ev: 'Electric Vehicles',
  etf: 'ETFs',
  'insider-trades': 'Insider Trades',
  ipo: 'IPOs',
  macro: 'Macro',
  markets: 'Markets',
  ma: 'Mergers & Acquisitions',
  'rare-earth': 'Rare Earth Minerals',
  semis: 'Semiconductors',
  'short-interest': 'Short Interest',
  space: 'Space',
};

const TAG_RULES: Record<string, RegExp> = {
  ai: /\b(ai\b|artificial intelligence|machine learning|large language model|llm|gpt|generative)/i,
  'analyst-ratings': /\b(analyst|upgrade|downgrade|price target|consensus rating|buy rating|sell rating)/i,
  biotech: /\b(biotech|pharma|pharmaceutical|fda|clinical trial|drug approval|biologic|gene therapy)/i,
  dividends: /\b(dividend|payout|distribution|yield|ex-dividend)/i,
  earnings: /\b(earnings|eps|quarterly results|q[1-4]\b|fiscal year|guidance)/i,
  ev: /\b(electric vehicle|EV\b|tesla|battery|charging|lithium-ion)/i,
  etf: /\b(etf|exchange[-\s]?traded fund|passive fund|index fund)/i,
  'insider-trades': /\b(insider|form 4|10b5-1|insider buying|insider selling|sec filing)/i,
  ipo: /\b(ipo|initial public offering|going public|stock market debut|s-1 filing)/i,
  macro: /\b(fed\b|federal reserve|inflation|cpi|gdp|rate cut|rate hike|interest rate|jobs report|unemployment)/i,
  markets: /\b(market|stock market|s&p ?500|nasdaq|dow jones|nyse|index|equit)/i,
  ma: /\b(merger|acquisition|takeover|m&a|buyout|acquir|merg)/i,
  'rare-earth': /\b(rare earth|lithium|cobalt|nickel|critical minerals)/i,
  semis: /\b(semiconductor|chip|chipmaker|nvda|amd|tsmc|silicon|wafer|foundry)/i,
  'short-interest': /\b(short interest|short squeeze|short selling|short seller|shorts)/i,
  space: /\b(space|rocket|satellite|spacex|aerospace|nasa)/i,
};

function classifyTags(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const out: string[] = [];
  for (const [tag, rx] of Object.entries(TAG_RULES)) {
    if (rx.test(text)) out.push(tag);
  }
  return out;
}

interface FeedDef {
  url: string;
  source: string;
  category: NewsCategory;
  region: NewsRegion;
  label: string;
}

const FEEDS: FeedDef[] = [
  {
    url: 'https://www.sec.gov/news/pressreleases.rss',
    source: 'SEC',
    category: 'Regulatory',
    region: 'US',
    label: 'Press release',
  },
  {
    url: 'https://www.sec.gov/news/speeches-statements.rss',
    source: 'SEC',
    category: 'Regulatory',
    region: 'US',
    label: 'Speech & statement',
  },
  {
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    source: 'Federal Reserve',
    category: 'Economy',
    region: 'US',
    label: 'Press release',
  },
  {
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    source: 'Federal Reserve',
    category: 'Economy',
    region: 'US',
    label: 'Monetary policy',
  },
  {
    url: 'https://home.treasury.gov/rss/news/press',
    source: 'U.S. Treasury',
    category: 'Economy',
    region: 'US',
    label: 'Press release',
  },
  {
    url: 'https://www.cftc.gov/PressRoom/PressReleases/Articles.xml',
    source: 'CFTC',
    category: 'Regulatory',
    region: 'US',
    label: 'Press release',
  },
  {
    url: 'https://www.bankofcanada.ca/topic/financial-system/feed/',
    source: 'Bank of Canada',
    category: 'Economy',
    region: 'Canada',
    label: 'Financial system',
  },
  {
    url: 'https://www.bankofcanada.ca/topic/monetary-policy/feed/',
    source: 'Bank of Canada',
    category: 'Economy',
    region: 'Canada',
    label: 'Monetary policy',
  },
  {
    url: 'https://www150.statcan.gc.ca/n1/dai-quo/rss/economic_eng.rss',
    source: 'Statistics Canada',
    category: 'Economy',
    region: 'Canada',
    label: 'Economic indicators',
  },
  {
    url: 'https://www.bls.gov/feed/news_release/empsit.rss',
    source: 'Bureau of Labor Statistics',
    category: 'Economy',
    region: 'US',
    label: 'Employment situation',
  },
  {
    url: 'https://www.bls.gov/feed/news_release/cpi.rss',
    source: 'Bureau of Labor Statistics',
    category: 'Economy',
    region: 'US',
    label: 'Consumer price index',
  },
  {
    url: 'https://www.fdic.gov/news/press-releases/index.xml',
    source: 'FDIC',
    category: 'Regulatory',
    region: 'US',
    label: 'Press release',
  },
  {
    url: 'https://www.newyorkfed.org/medialibrary/media/research/blog/feed.xml',
    source: 'New York Fed',
    category: 'Economy',
    region: 'US',
    label: 'Liberty Street research',
  },
];

const FUND_KEYWORDS = /(fund|ETF|mutual|investment\s+compan|advis|portfolio)/i;
const MARKET_KEYWORDS = /(market|stock|equit|trade|exchange|S&P|nasdaq|dow|nyse)/i;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly http: AxiosInstance;
  private readonly xml: XMLParser;
  private cache: { ts: number; items: NewsItem[] } | null = null;
  private readonly CACHE_MS = 5 * 60 * 1000;

  constructor() {
    const userAgent = process.env.SEC_USER_AGENT || 'Insider Buying contact@iqs.local';
    this.http = axios.create({
      timeout: 8000,
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });
    this.xml = new XMLParser({ ignoreAttributes: false, trimValues: true });
  }

  async getLatest(): Promise<NewsItem[]> {
    if (this.cache && Date.now() - this.cache.ts < this.CACHE_MS) {
      return this.cache.items;
    }
    const results = await Promise.allSettled(FEEDS.map((f) => this.fetchFeed(f)));
    const items: NewsItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') items.push(...r.value);
      else this.logger.warn(`Feed failed: ${r.reason?.message || r.reason}`);
    }
    for (const it of items) {
      if (it.category === 'Regulatory') {
        if (FUND_KEYWORDS.test(it.title) || FUND_KEYWORDS.test(it.description)) {
          it.category = 'Funds';
        } else if (MARKET_KEYWORDS.test(it.title) || MARKET_KEYWORDS.test(it.description)) {
          it.category = 'Market';
        }
      }
    }
    items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    const seenLinks = new Set<string>();
    const seenIds = new Set<string>();
    const deduped: NewsItem[] = [];
    for (const it of items) {
      const linkKey = (it.link || '').split('#')[0].split('?')[0].toLowerCase();
      if (linkKey && seenLinks.has(linkKey)) continue;
      if (seenIds.has(it.id)) continue;
      if (linkKey) seenLinks.add(linkKey);
      seenIds.add(it.id);
      deduped.push(it);
    }

    const trimmed = deduped.slice(0, 150);
    this.cache = { ts: Date.now(), items: trimmed };
    return trimmed;
  }

  filter(
    items: NewsItem[],
    opts: {
      category?: NewsCategory;
      region?: NewsRegion;
      tag?: string;
      sort?: 'latest' | 'popular';
    },
  ): NewsItem[] {
    const wantedTags = opts.tag
      ? opts.tag.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    let out = items.filter(
      (n) =>
        (!opts.category || n.category === opts.category) &&
        (!opts.region || n.region === opts.region) &&
        (wantedTags.length === 0 ||
          wantedTags.some((t) => (n.tags || []).includes(t))),
    );
    if (opts.sort === 'popular') {
      out = [...out].sort(
        (a, b) =>
          (b.tags?.length || 0) - (a.tags?.length || 0) ||
          new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
      );
    }
    return out;
  }

  private async fetchFeed(feed: FeedDef): Promise<NewsItem[]> {
    const { data } = await this.http.get(feed.url, { responseType: 'text' });
    const parsed = this.xml.parse(data);
    const channel = parsed?.rss?.channel || parsed?.feed;
    const rawItems = channel?.item || channel?.entry || [];
    const list = Array.isArray(rawItems) ? rawItems : [rawItems];
    return list
      .filter(Boolean)
      .slice(0, 30)
      .map((it: any): NewsItem => {
        const title = String(it.title?.['#text'] || it.title || '').trim();
        const link =
          typeof it.link === 'string'
            ? it.link
            : it.link?.['@_href'] || it.link?.['#text'] || it.guid?.['#text'] || it.guid || '';
        const description = String(
          it.description || it.summary || it['content:encoded'] || '',
        )
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const pubDate = String(it.pubDate || it.updated || it.published || '');
        const id = String(it.guid?.['#text'] || it.guid || it.id || link || title);
        return {
          id: `${feed.source}-${id}`.slice(0, 240),
          title,
          description: description.slice(0, 320),
          link,
          source: feed.source,
          category: feed.category,
          region: feed.region,
          label: feed.label,
          pubDate,
          tags: classifyTags(title, description),
        };
      })
      .filter((n) => n.title && n.link);
  }
}
