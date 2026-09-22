import { Module } from '@nestjs/common';
import { IqsModule } from '../../iqs/iqs.module';
import { CoverService } from './cover.service';
import { DailyDeskController } from './daily-desk.controller';
import { DailyDeskService } from './daily-desk.service';
import { ResearchService } from './research.service';
import { WriterService } from './writer.service';

/** The daily desk. Registered from AppModule; everything it reads it reads
 *  through the shared DataSource, so it adds no new repositories. */
@Module({
  imports: [IqsModule],
  controllers: [DailyDeskController],
  providers: [DailyDeskService, ResearchService, WriterService, CoverService],
  exports: [DailyDeskService],
})
export class DailyDeskModule {}
