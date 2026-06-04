import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { NewsCategory, NewsRegion, NewsService } from './news.service';
import { ArticleService } from './article.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly news: NewsService,
    private readonly article: ArticleService,
  ) {}

  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('region') region?: string,
    @Query('tag') tag?: string,
    @Query('sort') sort?: string,
  ) {
    let items = await this.news.getLatest();
    const opts: {
      category?: NewsCategory;
      region?: NewsRegion;
      tag?: string;
      sort?: 'latest' | 'popular';
    } = {};
    if (category && ['Market', 'Economy', 'Funds', 'Regulatory'].includes(category)) {
      opts.category = category as NewsCategory;
    }
    if (region && ['US', 'Canada'].includes(region)) {
      opts.region = region as NewsRegion;
    }
    if (tag) opts.tag = tag;
    if (sort === 'popular' || sort === 'latest') opts.sort = sort;
    if (opts.category || opts.region || opts.tag || opts.sort) {
      items = this.news.filter(items, opts);
    }
    const n = limit ? Math.min(120, Math.max(1, Number(limit))) : 24;
    return { total: items.length, items: items.slice(0, n) };
  }

  @Get('image')
  async getImage(
    @Query('u') url?: string,
    @Query('category') category?: string,
    @Query('seed') seed?: string,
    @Query('title') title?: string,
  ) {
    if (!url) throw new BadRequestException('Missing url');
    if (!this.article.isAllowed(url)) {
      return { image: null };
    }
    const image = await this.article.getImage(url, { category, seed, title });
    return { image };
  }

  @Get('article')
  async getArticle(@Query('u') url?: string) {
    if (!url) throw new BadRequestException('Missing url');
    if (!this.article.isAllowed(url)) {
      throw new BadRequestException('URL not allowed');
    }
    try {
      return await this.article.fetch(url);
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Failed to fetch article');
    }
  }
}
