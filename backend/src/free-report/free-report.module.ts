import { Module } from '@nestjs/common';
import { FmpModule } from '../fmp/fmp.module';
import { FreeReportController } from './free-report.controller';
import { FreeReportService } from './free-report.service';

/** "Get On The Inside" — the free investor report lead magnet (PDF). */
@Module({
  imports: [FmpModule],
  controllers: [FreeReportController],
  providers: [FreeReportService],
  exports: [FreeReportService],
})
export class FreeReportModule {}
