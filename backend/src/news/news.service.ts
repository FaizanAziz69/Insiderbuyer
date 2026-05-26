import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { XMLParser } from 'fast-xml-parser';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  category: string;
  pubDate: string;
}

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
      timeout: 12000,
      headers: { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/xml' },
    });
    this.xml = new XMLParser({ ignoreAttributes: false, trimValues: true });
  }

  async getLatest(): Promise<NewsItem[]> {
    if (this.cache && Date.now() - this.cache.ts < this.CACHE_MS) {
      return this.cache.items;
    }
    const items: NewsItem[] = [];
    try {
      const press = await this.fetchFeed(
        'https://www.sec.gov/news/pressreleases.rss',
        'SEC',
        'Press release',
      );
      items.push(...press);
    } catch (e: any) {
      this.logger.warn(`SEC press: ${e?.message || e}`);
    }
    try {
      const speeches = await this.fetchFeed(
        'https://www.sec.gov/news/speeches-statements.rss',
        'SEC',
        'Speech & statement',
      );
      items.push(...speeches);
    } catch (e: any) {
      this.logger.warn(`SEC speeches: ${e?.message || e}`);
    }

    items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    const trimmed = items.slice(0, 60);
    this.cache = { ts: Date.now(), items: trimmed };
    return trimmed;
  }

  private async fetchFeed(url: string, source: string, category: string): Promise<NewsItem[]> {
    const { data } = await this.http.get(url, { responseType: 'text' });
    const parsed = this.xml.parse(data);
    const channel = parsed?.rss?.channel || parsed?.feed;
    const rawItems = channel?.item || channel?.entry || [];
    const list = Array.isArray(rawItems) ? rawItems : [rawItems];
    return list
      .filter(Boolean)
      .map((it: any): NewsItem => {
        const title = String(it.title?.['#text'] || it.title || '').trim();
        const link =
          typeof it.link === 'string'
            ? it.link
            : it.link?.['@_href'] || it.link?.['#text'] || '';
        const description = String(it.description || it.summary || '').replace(/<[^>]+>/g, '').trim();
        const pubDate = String(it.pubDate || it.updated || it.published || '');
        const id = String(it.guid?.['#text'] || it.guid || it.id || link || title);
        return {
          id: id.slice(0, 240),
          title,
          description: description.slice(0, 320),
          link,
          source,
          category,
          pubDate,
        };
      })
      .filter((n) => n.title && n.link);
  }
}
