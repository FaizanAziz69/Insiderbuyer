import { Module } from '@nestjs/common';
import { FmpModule } from '../fmp/fmp.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogPost } from '../entities/blog-post.entity';
import { StoryPitch } from '../entities/story-pitch.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { AppSetting } from '../entities/app-setting.entity';
import { IqsModule } from '../iqs/iqs.module';
import { NewsModule } from '../news/news.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ContentGeneratorService } from './content-generator.service';
import { ContentCronService } from './content-cron.service';
import { StoryDeskService } from './story-desk.service';
import { StoryDeskController } from './story-desk.controller';

@Module({
  imports: [
    FmpModule,
    TypeOrmModule.forFeature([BlogPost, StoryPitch, InsiderTransaction, AppSetting]),
    IqsModule,
    NewsModule,
    MarketStatsModule,
  ],
  controllers: [ContentController, StoryDeskController],
  providers: [
    ContentService,
    ContentGeneratorService,
    ContentCronService,
    StoryDeskService,
  ],
  exports: [ContentService],
})
export class ContentModule {}
