import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportLead } from '../entities/report-lead.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { ContentModule } from '../content/content.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { LandingController } from './landing.controller';
import { LandingService } from './landing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportLead, InsiderTransaction]),
    IqsModule,
    MarketStatsModule,
    ContentModule,
  ],
  controllers: [ReportsController, LandingController],
  providers: [ReportsService, LandingService],
})
export class ReportsModule {}
