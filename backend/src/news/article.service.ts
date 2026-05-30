import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface ExtractedArticle {
  url: string;
  source: string;
  title: string;
  byline: string | null;
  publishedAt: string | null;
  html: string;
  textPreview: string;
}

const ALLOWED_HOSTS = new Set([
  'www.sec.gov',
  'sec.gov',
  'www.federalreserve.gov',
  'federalreserve.gov',
  'home.treasury.gov',
  'treasury.gov',
  'www.cftc.gov',
  'cftc.gov',
  'www.bankofcanada.ca',
  'bankofcanada.ca',
  'www150.statcan.gc.ca',
  'statcan.gc.ca',
]);

const SOURCE_LABELS: Record<string, string> = {
  'sec.gov': 'U.S. Securities and Exchange Commission',
  'www.sec.gov': 'U.S. Securities and Exchange Commission',
  'federalreserve.gov': 'Federal Reserve',
  'www.federalreserve.gov': 'Federal Reserve',
  'home.treasury.gov': 'U.S. Department of the Treasury',
  'treasury.gov': 'U.S. Department of the Treasury',
  'www.cftc.gov': 'Commodity Futures Trading Commission',
  'cftc.gov': 'Commodity Futures Trading Commission',
  'www.bankofcanada.ca': 'Bank of Canada',
  'bankofcanada.ca': 'Bank of Canada',
  'www150.statcan.gc.ca': 'Statistics Canada',
  'statcan.gc.ca': 'Statistics Canada',
};

const SOURCE_WIKI_QUERY: Record<string, string> = {
  'sec.gov': 'Securities Exchange Commission building',
  'www.sec.gov': 'Securities Exchange Commission building',
  'federalreserve.gov': 'Federal Reserve building Washington',
  'www.federalreserve.gov': 'Federal Reserve building Washington',
  'home.treasury.gov': 'United States Treasury Department building',
  'treasury.gov': 'United States Treasury Department building',
  'www.cftc.gov': 'Commodity Futures Trading Commission',
  'cftc.gov': 'Commodity Futures Trading Commission',
  'www.bankofcanada.ca': 'Bank of Canada Ottawa',
  'bankofcanada.ca': 'Bank of Canada Ottawa',
  'www150.statcan.gc.ca': 'Statistics Canada',
  'statcan.gc.ca': 'Statistics Canada',
};

const UNSPLASH_BY_CATEGORY: Record<string, string[]> = {
  Market: [
    '1611974789855-9c2a0a7236a3',
    '1590283603385-17ffb3a7f29f',
    '1559526324-4b87b5e36e44',
    '1611224923853-80b023f02d71',
    '1642790106117-e829e14a795f',
    '1604594849809-dfedbc827105',
  ],
  Economy: [
    '1554224155-6726b3ff858f',
    '1554224311-beee415c201f',
    '1554224154-22dec7ec8818',
    '1633158829585-23ba8f7c8caf',
    '1611324586863-a0d1bd2db2bb',
  ],
  Funds: [
    '1554224155-1696413565d3',
    '1638272181967-7d3772a91265',
    '1611162616305-c69b3fa7fbe0',
    '1551288049-bebda4e38f71',
    '1565514020179-026b92b84bb6',
  ],
  Regulatory: [
    '1589994965851-a8f479c573a9',
    '1505664194779-8beaceb93744',
    '1583468982228-19f19164aee2',
    '1591115765373-5207764f72e7',
    '1564507592333-c60657eea523',
  ],
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

@Injectable()
export class ArticleService {
  private readonly logger = new Logger(ArticleService.name);
  private readonly http: AxiosInstance;
  private readonly cache = new Map<string, { ts: number; article: ExtractedArticle }>();
  private readonly imageCache = new Map<string, { ts: number; image: string | null }>();
  private readonly wikiCandidatesCache = new Map<string, { ts: number; hits: string[] }>();
  private readonly CACHE_MS = 60 * 60 * 1000;
  private readonly IMG_CACHE_MS = 24 * 60 * 60 * 1000;

  constructor() {
    const userAgent = process.env.SEC_USER_AGENT || 'Insider Buying contact@iqs.local';
    this.http = axios.create({
      timeout: 12000,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
      maxRedirects: 3,
    });
  }

  isAllowed(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
      return ALLOWED_HOSTS.has(u.hostname);
    } catch {
      return false;
    }
  }

  async getImage(
    url: string,
    ctx?: { category?: string; seed?: string },
  ): Promise<string | null> {
    if (!this.isAllowed(url)) return null;
    const cacheKey = `${url}|${ctx?.category || ''}|${ctx?.seed || ''}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.IMG_CACHE_MS) return cached.image;

    let image: string | null = null;

    image = await this.fetchOgImage(url);
    if (!image) {
      image = await this.searchWikimedia(url, ctx?.seed || url);
    }
    if (!image && ctx?.category) {
      image = this.pickUnsplash(ctx.category, ctx?.seed || url);
    }

    this.imageCache.set(cacheKey, { ts: Date.now(), image });
    if (this.imageCache.size > 800) {
      const oldest = [...this.imageCache.entries()].sort(
        (a, b) => a[1].ts - b[1].ts,
      )[0];
      this.imageCache.delete(oldest[0]);
    }
    return image;
  }

  private async fetchOgImage(url: string): Promise<string | null> {
    try {
      const { data: html } = await this.http.get(url, { responseType: 'text' });
      const m =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (m && m[1]) {
        try {
          return new URL(m[1], url).toString();
        } catch {
          return null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getWikimediaCandidates(host: string): Promise<string[]> {
    const cached = this.wikiCandidatesCache.get(host);
    if (cached && Date.now() - cached.ts < this.IMG_CACHE_MS) return cached.hits;
    const query = SOURCE_WIKI_QUERY[host] || 'finance markets';
    try {
      const { data } = await this.http.get(
        'https://commons.wikimedia.org/w/api.php',
        {
          params: {
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: `${query} filetype:bitmap`,
            srnamespace: 6,
            srlimit: 15,
          },
          timeout: 8000,
          headers: { Accept: 'application/json' },
        },
      );
      const hits: string[] = ((data?.query?.search || []) as any[])
        .map((h) => String(h.title || '').replace(/^File:/, ''))
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
      this.wikiCandidatesCache.set(host, { ts: Date.now(), hits });
      return hits;
    } catch (err: any) {
      this.logger.warn(`Wikimedia search failed for ${host}: ${err?.message || err}`);
      this.wikiCandidatesCache.set(host, { ts: Date.now(), hits: [] });
      return [];
    }
  }

  private async searchWikimedia(url: string, seed: string): Promise<string | null> {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    const candidates = await this.getWikimediaCandidates(host);
    if (candidates.length === 0) return null;
    const idx = hashSeed(seed) % candidates.length;
    const filename = candidates[idx];
    const encoded = encodeURIComponent(filename.replace(/ /g, '_'));
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=800`;
  }

  private pickUnsplash(category: string, seed: string): string | null {
    const set = UNSPLASH_BY_CATEGORY[category];
    if (!set || set.length === 0) return null;
    const idx = hashSeed(seed) % set.length;
    return `https://images.unsplash.com/photo-${set[idx]}?w=800&h=400&fit=crop&q=80&auto=format`;
  }

  async fetch(url: string): Promise<ExtractedArticle> {
    if (!this.isAllowed(url)) {
      throw new Error('URL is not from an allowed public-domain source');
    }
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.ts < this.CACHE_MS) return cached.article;

    const { data: html } = await this.http.get(url, { responseType: 'text' });
    const article = this.extract(html, url);
    this.cache.set(url, { ts: Date.now(), article });
    if (this.cache.size > 200) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      this.cache.delete(oldest[0]);
    }
    return article;
  }

  private extract(html: string, url: string): ExtractedArticle {
    const host = new URL(url).hostname;
    const source = SOURCE_LABELS[host] || host;

    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    const title = decodeEntities((titleMatch?.[1] || '').replace(/\s+\|\s+.+$/, '').trim());

    const publishedMatch =
      html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']dc\.date["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const publishedAt = publishedMatch?.[1] || null;

    const bylineMatch =
      html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
    const byline = bylineMatch?.[1] ? decodeEntities(bylineMatch[1]) : null;

    let body = html;

    body = body.replace(/<!--[\s\S]*?-->/g, '');
    body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
    body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
    body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    body = body.replace(/<header[\s\S]*?<\/header>/gi, '');
    body = body.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    body = body.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    body = body.replace(/<aside[\s\S]*?<\/aside>/gi, '');
    body = body.replace(/<form[\s\S]*?<\/form>/gi, '');
    body = body.replace(/<svg[\s\S]*?<\/svg>/gi, '');

    let mainHtml = body;
    const articleMatch = body.match(/<article[\s\S]*?<\/article>/i);
    if (articleMatch) {
      mainHtml = articleMatch[0];
    } else {
      const mainMatch = body.match(/<main[\s\S]*?<\/main>/i);
      if (mainMatch) mainHtml = mainMatch[0];
    }

    const blocks: string[] = [];
    const blockRe =
      /<(p|h1|h2|h3|h4|h5|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRe.exec(mainHtml)) !== null) {
      const tag = match[1].toLowerCase();
      const raw = match[2]
        .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const clean = decodeEntities(raw);
      if (!clean || clean.length < 2) continue;
      if (/^(skip to|menu|search|sign in|subscribe)/i.test(clean)) continue;
      blocks.push(renderBlock(tag, clean));
    }

    const finalHtml =
      blocks.length > 0
        ? blocks.join('\n')
        : '<p>Full article preview is unavailable. Please follow the source link below to read it on the publisher\'s site.</p>';

    const textPreview = blocks
      .map((b) => b.replace(/<[^>]+>/g, ''))
      .join(' ')
      .slice(0, 320);

    return {
      url,
      source,
      title: title || 'Untitled',
      byline,
      publishedAt,
      html: finalHtml,
      textPreview,
    };
  }
}

function renderBlock(tag: string, text: string): string {
  switch (tag) {
    case 'h1':
      return `<h1>${text}</h1>`;
    case 'h2':
      return `<h2>${text}</h2>`;
    case 'h3':
    case 'h4':
    case 'h5':
      return `<h3>${text}</h3>`;
    case 'li':
      return `<li>${text}</li>`;
    case 'blockquote':
      return `<blockquote>${text}</blockquote>`;
    default:
      return `<p>${text}</p>`;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
