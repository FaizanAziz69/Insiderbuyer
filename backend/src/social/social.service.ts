import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface DiscussionPost {
  id: string;
  source: 'reddit';
  subreddit: string;
  author: string;
  title: string;
  excerpt: string;
  url: string;
  upvotes: number;
  comments: number;
  createdAt: string; // ISO
}

export interface DiscussionsResponse {
  enabled: boolean;
  ticker: string;
  posts: DiscussionPost[];
}

/**
 * Community "Conversations" feed per ticker (stockanalysis.com-style tab).
 *
 * Powered by Reddit's free OAuth API (client-credentials app — register at
 * reddit.com/prefs/apps, no cost) because X/Twitter data requires a paid API
 * ($200+/mo) and anonymous scraping violates ToS. When REDDIT_CLIENT_ID /
 * REDDIT_CLIENT_SECRET are not set, the endpoint reports `enabled: false`
 * and the frontend shows a coming-soon state.
 *
 * TODO: optionally add an X (Twitter) API source when the client provides a
 * paid X API key — same DiscussionPost shape, merged into `posts`.
 */
@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);
  private token: { value: string; expiresAt: number } | null = null;
  private cache = new Map<string, { ts: number; data: DiscussionsResponse }>();
  private readonly CACHE_MS = 10 * 60 * 1000;
  /** Finance-heavy subreddits searched for ticker mentions. */
  private readonly SUBS = 'stocks+wallstreetbets+investing+StockMarket+options+pennystocks';

  private get configured(): boolean {
    return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
  }

  async getDiscussions(ticker: string): Promise<DiscussionsResponse> {
    const sym = (ticker || '').toUpperCase();
    if (!sym || !this.configured) return { enabled: false, ticker: sym, posts: [] };

    const hit = this.cache.get(sym);
    if (hit && Date.now() - hit.ts < this.CACHE_MS) return hit.data;

    try {
      const posts = await this.fetchReddit(sym);
      const data: DiscussionsResponse = { enabled: true, ticker: sym, posts };
      this.cache.set(sym, { ts: Date.now(), data });
      return data;
    } catch (err: any) {
      this.logger.warn(`Reddit discussions failed for ${sym}: ${err?.message || err}`);
      // Serve stale cache over an empty error state.
      return hit?.data ?? { enabled: true, ticker: sym, posts: [] };
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const { data } = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      {
        auth: {
          username: process.env.REDDIT_CLIENT_ID!,
          password: process.env.REDDIT_CLIENT_SECRET!,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'web:insiderbuying.com:v1.0 (stock research)',
        },
        timeout: 8000,
      },
    );
    const value = data?.access_token;
    if (!value) throw new Error('No Reddit access token returned');
    // Tokens last 1h — refresh at 50 min.
    this.token = { value, expiresAt: Date.now() + 50 * 60 * 1000 };
    return value;
  }

  private async fetchReddit(sym: string): Promise<DiscussionPost[]> {
    const token = await this.accessToken();
    const { data } = await axios.get(
      `https://oauth.reddit.com/r/${this.SUBS}/search`,
      {
        params: {
          q: `"${sym}"`,
          restrict_sr: 1,
          sort: 'new',
          t: 'month',
          limit: 25,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'web:insiderbuying.com:v1.0 (stock research)',
        },
        timeout: 8000,
      },
    );
    const children: any[] = data?.data?.children ?? [];
    return children
      .map((c) => c?.data)
      .filter(Boolean)
      .map((p): DiscussionPost => ({
        id: String(p.id),
        source: 'reddit',
        subreddit: String(p.subreddit || ''),
        author: String(p.author || ''),
        title: String(p.title || '').slice(0, 300),
        excerpt: String(p.selftext || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240),
        url: `https://www.reddit.com${p.permalink || ''}`,
        upvotes: Number(p.ups) || 0,
        comments: Number(p.num_comments) || 0,
        createdAt: new Date((Number(p.created_utc) || 0) * 1000).toISOString(),
      }))
      // Keep posts that actually mention the ticker in title or body.
      .filter((p) => new RegExp(`\\b\\$?${sym}\\b`, 'i').test(`${p.title} ${p.excerpt}`));
  }
}
