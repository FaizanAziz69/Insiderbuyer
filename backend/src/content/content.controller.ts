import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentGeneratorService } from './content-generator.service';
import { CONTENT_FORMATS, findFormat } from './content-formats';
import { BlogKind } from '../entities/blog-post.entity';

@Controller('content')
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly generator: ContentGeneratorService,
  ) {}

  /** The full content-guide format library (Top Stories, series, programmatic). */
  @Get('formats')
  formats() {
    return {
      formats: CONTENT_FORMATS.map((f) => ({
        key: f.key,
        ref: f.ref,
        kind: f.kind,
        title: f.title,
        section: f.section,
        trigger: f.trigger,
        headlineFormula: f.headlineFormula,
        requiredData: f.requiredData,
        sections: f.sections ?? null,
        cadenceTag: f.cadenceTag ?? null,
        wordCount: f.wordCount ?? null,
        editorialNote: f.editorialNote ?? null,
      })),
    };
  }

  /** Generate an article for a specific guide format from supplied data.
   *  Body = the data payload the format's `requiredData` describes. */
  @Post('formats/:key/generate')
  async generateFormat(@Param('key') key: string, @Body() data: unknown) {
    const format = findFormat(key);
    if (!format) throw new NotFoundException(`Unknown content format: ${key}`);
    if (!this.generator.isReady()) {
      throw new NotFoundException(
        'Content generator not configured (ANTHROPIC_API_KEY missing).',
      );
    }
    const article = await this.generator.generateFromFormat(format, data);
    return { format: format.key, ref: format.ref, article };
  }

  /** AI Bull Case vs Bear Case for a ticker (our own; grounded in recent news
   *  + Insider Score). Cached 24h. */
  @Get('bull-bear/:ticker')
  async bullBear(
    @Param('ticker') ticker: string,
    @Query('name') name?: string,
    @Query('sector') sector?: string,
    @Query('score') score?: string,
  ) {
    const data = await this.content.getBullBear(
      ticker,
      name || ticker,
      sector || null,
      score != null && score !== '' ? Number(score) : null,
    );
    return { ticker: ticker.toUpperCase(), bullBear: data };
  }

  /** Latest articles, newest first. Filter by kind and/or ticker. */
  @Get('blogs')
  async list(
    @Query('limit') limit?: string,
    @Query('kind') kind?: BlogKind,
    @Query('ticker') ticker?: string,
    @Query('topic') topic?: string,
  ) {
    const n = Math.min(60, Math.max(1, parseInt(limit || '30', 10)));
    const rows = await this.content.list({ limit: n, kind, ticker, topic });
    return {
      items: rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        kind: r.kind,
        ticker: r.ticker,
        sector: r.sector,
        topic: r.topic,
        summary: r.summary,
        eyebrow: r.eyebrow,
        imageUrl: r.imageUrl,
        tags: r.tags,
        featuredTickers: r.featuredTickers,
        generatedAt: r.generatedAt,
      })),
    };
  }

  @Get('blogs/:slug')
  async one(@Param('slug') slug: string) {
    const post = await this.content.bySlug(slug);
    if (!post) throw new NotFoundException(`No article for slug ${slug}`);
    return post;
  }

  @Get('by-ticker/:ticker')
  async byTicker(@Param('ticker') ticker: string, @Query('limit') limit?: string) {
    const n = Math.min(20, Math.max(1, parseInt(limit || '5', 10)));
    return { items: await this.content.byTicker(ticker, n) };
  }

  /** On-demand AI "movement explainer" for any ticker (cached server-side). */
  @Get('explain')
  async explain(
    @Query('symbol') symbol: string,
    @Query('name') name = '',
    @Query('change') change = '0',
  ) {
    if (!symbol) return { title: '', explainer: '' };
    return this.content.getMovementExplainer(symbol, name, Number(change) || 0);
  }

  /** Pre-warm movement explainers for a movers table in one model call —
   *  the gainers/losers pages post their visible rows on load so every ✨
   *  hover resolves instantly. Body: { items: [{symbol, name, changePct}] } */
  @Post('explain-batch')
  async explainBatch(
    @Body() body: { items?: Array<{ symbol: string; name?: string; changePct?: number }> },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return { explainers: {} };
    return { explainers: await this.content.getMovementExplainersBatch(items) };
  }

  /** Manual trigger for the daily refresh. Same path used by the cron.
   *  `?reset=1` clears today's articles first (regenerate the same slugs through
   *  the current engine); `?limit=N` caps generations per call so batched
   *  regeneration fits within the serverless time budget. */
  @Post('refresh')
  async refresh(
    @Query('reset') reset?: string,
    @Query('stale') stale?: string,
    @Query('limit') limit?: string,
  ) {
    return this.content.runDailyRefresh({
      reset: reset === '1' || reset === 'true',
      // ?reset=all — wipe the whole feed once, then batched calls rebuild it.
      resetAll: reset === 'all',
      staleOnly: stale === '1' || stale === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }
}
