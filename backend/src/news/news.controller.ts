import { Controller, Get, Query } from '@nestjs/common';
import { NewsCategory, NewsRegion, NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('region') region?: string,
  ) {
    let items = await this.news.getLatest();
    const opts: { category?: NewsCategory; region?: NewsRegion } = {};
    if (category && ['Market', 'Economy', 'Funds', 'Regulatory'].includes(category)) {
      opts.category = category as NewsCategory;
    }
    if (region && ['US', 'Canada'].includes(region)) {
      opts.region = region as NewsRegion;
    }
    if (opts.category || opts.region) items = this.news.filter(items, opts);
    const n = limit ? Math.min(120, Math.max(1, Number(limit))) : 24;
    return { total: items.length, items: items.slice(0, n) };
  }
}
