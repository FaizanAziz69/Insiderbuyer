import { Module } from '@nestjs/common';
import { FmpModule } from '../fmp/fmp.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogPost } from '../entities/blog-post.entity';
import { IqsModule } from '../iqs/iqs.module';
import { NewsModule } from '../news/news.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ContentGeneratorService } from './content-generator.service';
import { ContentCronService } from './content-cron.service';

@Module({
  imports: [
    FmpModule,
    TypeOrmModule.forFeature([BlogPost]),
    IqsModule,
    NewsModule,
    MarketStatsModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, ContentGeneratorService, ContentCronService],
  exports: [ContentService],
})
export class ContentModule {}
