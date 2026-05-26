import { Controller, Get, Query } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const items = await this.news.getLatest();
    const n = limit ? Math.min(60, Math.max(1, Number(limit))) : 20;
    return { total: items.length, items: items.slice(0, n) };
  }
}
