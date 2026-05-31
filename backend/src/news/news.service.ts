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
    opts: { category?: NewsCategory; region?: NewsRegion },
  ): NewsItem[] {
    return items.filter(
      (n) =>
        (!opts.category || n.category === opts.category) &&
        (!opts.region || n.region === opts.region),
    );
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
        };
      })
      .filter((n) => n.title && n.link);
  }
}
