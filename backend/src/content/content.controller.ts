import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { BlogKind } from '../entities/blog-post.entity';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

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

  /** Manual trigger for the daily refresh. Same path used by the cron. */
  @Post('refresh')
  async refresh() {
    return this.content.runDailyRefresh();
  }
}
