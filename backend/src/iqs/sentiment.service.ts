import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { SentimentScore } from '../entities/sentiment-score.entity';

interface Headline {
  title: string;
  publisher: string;
  publishedAt: number; // unix seconds
}

const SENTIMENT_TOOL: Anthropic.Messages.Tool = {
  name: 'report_sentiment',
  description:
    'Report the news-sentiment score for one stock based on the supplied headlines.',
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: 'integer',
        description:
          'News sentiment 0-100. 50 = neutral/mixed coverage. Above 50 = bullish tone (upgrades, beats, growth, positive catalysts). Below 50 = bearish tone (downgrades, misses, lawsuits, negative catalysts). Reserve <20 and >80 for unmistakably one-sided coverage.',
      },
      rationale: {
        type: 'string',
        description:
          'One sentence (max 140 chars) explaining the dominant tone of the coverage. Cautious, factual wording — no advice.',
      },
    },
    required: ['score', 'rationale'],
  },
};

/**
 * News-sentiment pillar for the composite score — no external sentiment
 * provider needed. Recent headlines come from Yahoo's public news feed (the
 * same keyless endpoint that powers the ticker search) and are scored 0-100
 * by Claude (the same key that powers the content engine). Results are cached
 * in Postgres so each ticker costs at most one model call per TTL window.
 */
@Injectable()
export class SentimentService {
  private readonly logger = new Logger(SentimentService.name);
  private readonly TTL_MS = 12 * 60 * 60 * 1000; // refresh at most twice a day
  private readonly MIN_HEADLINES = 3;
  private anthropic: Anthropic | null | undefined; // undefined = not initialised

  constructor(
    @InjectRepository(SentimentScore)
    private readonly repo: Repository<SentimentScore>,
  ) {}

  private client(): Anthropic | null {
    if (this.anthropic !== undefined) return this.anthropic;
    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
    if (!this.anthropic) {
      this.logger.warn('ANTHROPIC_API_KEY not set — sentiment pillar disabled');
    }
    return this.anthropic;
  }

  /** 0-100 sentiment for a ticker, or null when unavailable. Serves the
   *  cached row inside the TTL; recomputes (headlines → Claude) after it. */
  async getSentimentScore(
    ticker: string,
    companyName?: string | null,
  ): Promise<{ score: number | null; rationale: string | null } | null> {
    const sym = (ticker || '').toUpperCase();
    if (!sym) return null;

    const existing = await this.repo.findOne({ where: { ticker: sym } });
    const fresh =
      existing && Date.now() - new Date(existing.updatedAt).getTime() < this.TTL_MS;
    if (existing && fresh) {
      return { score: existing.score, rationale: existing.rationale };
    }

    try {
      const computed = await this.compute(sym, companyName);
      const row = existing ?? this.repo.create({ ticker: sym });
      row.score = computed.score;
      row.headlineCount = computed.headlineCount;
      row.rationale = computed.rationale;
      await this.repo.save(row);
      return { score: row.score, rationale: row.rationale };
    } catch (err: any) {
      this.logger.warn(`Sentiment compute failed for ${sym}: ${err?.message || err}`);
      // Fall back to the stale row rather than dropping the pillar entirely.
      return existing ? { score: existing.score, rationale: existing.rationale } : null;
    }
  }

  private async compute(
    sym: string,
    companyName?: string | null,
  ): Promise<{ score: number | null; headlineCount: number; rationale: string | null }> {
    const headlines = await this.fetchHeadlines(sym);
    if (headlines.length < this.MIN_HEADLINES) {
      return { score: null, headlineCount: headlines.length, rationale: null };
    }
    const anthropic = this.client();
    if (!anthropic) return { score: null, headlineCount: headlines.length, rationale: null };

    const list = headlines
      .map((h) => `- [${h.publisher}] ${h.title}`)
      .join('\n');
    const subject = companyName ? `${companyName} (${sym})` : sym;

    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [SENTIMENT_TOOL],
      tool_choice: { type: 'tool', name: 'report_sentiment' },
      messages: [
        {
          role: 'user',
          content:
            `Score the news sentiment for ${subject} from these recent headlines. ` +
            `Ignore headlines that are not actually about ${subject}. ` +
            `Weigh analyst actions, earnings, and concrete business news more than opinion pieces.\n\n${list}`,
        },
      ],
    });

    const tool = res.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );
    const input = (tool?.input ?? {}) as { score?: number; rationale?: string };
    const raw = Number(input.score);
    const score = Number.isFinite(raw)
      ? Math.round(Math.max(0, Math.min(100, raw)))
      : null;
    return {
      score,
      headlineCount: headlines.length,
      rationale: (input.rationale || '').slice(0, 200) || null,
    };
  }

  /** Recent headlines for one ticker from Yahoo's public news feed. */
  private async fetchHeadlines(sym: string): Promise<Headline[]> {
    const { data } = await axios.get(
      'https://query1.finance.yahoo.com/v1/finance/search',
      {
        params: { q: sym, newsCount: 12, quotesCount: 0 },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000,
      },
    );
    const news: any[] = Array.isArray(data?.news) ? data.news : [];
    const cutoff = Date.now() / 1000 - 14 * 24 * 60 * 60; // last 14 days
    return news
      .map((n) => ({
        title: String(n?.title || '').trim(),
        publisher: String(n?.publisher || '').trim(),
        publishedAt: Number(n?.providerPublishTime) || 0,
      }))
      .filter((h) => h.title && (!h.publishedAt || h.publishedAt >= cutoff))
      .slice(0, 12);
  }
}
