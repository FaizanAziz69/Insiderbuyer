import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportLead } from '../entities/report-lead.entity';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
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
    TypeOrmModule.forFeature([ReportLead, InsiderTransaction, User]),
    AuthModule,
    BillingModule,
    IqsModule,
    MarketStatsModule,
    ContentModule,
  ],
  controllers: [ReportsController, LandingController],
  providers: [ReportsService, LandingService],
  exports: [ReportsService, LandingService],
})
export class ReportsModule {}
