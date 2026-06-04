import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { ArticleService } from './article.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, ArticleService],
  exports: [NewsService, ArticleService],
})
export class NewsModule {}
