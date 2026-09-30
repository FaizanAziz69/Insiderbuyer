import { Module } from '@nestjs/common';
import { IqsModule } from '../../iqs/iqs.module';
import { CoverService } from './cover.service';
import { DailyDeskController } from './daily-desk.controller';
import { DailyDeskService } from './daily-desk.service';
import { ResearchService } from './research.service';
import { SubjectLookupService } from './subject-lookup.service';
import { WriterService } from './writer.service';

/** The daily desk. Registered from AppModule; everything it reads it reads
 *  through the shared DataSource, so it adds no new repositories. */
@Module({
  imports: [IqsModule],
  controllers: [DailyDeskController],
  providers: [
    DailyDeskService,
    ResearchService,
    WriterService,
    CoverService,
    SubjectLookupService,
  ],
  // CoverService is exported so the topic rail can use the same cover
  // pipeline — the anonymous-figures rule for stories with nobody in them
  // lives there, and duplicating it would mean two rules to keep in step.
  exports: [DailyDeskService, CoverService, SubjectLookupService],
})
export class DailyDeskModule {}
