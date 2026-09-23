import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { User } from '../entities/user.entity';
import { FmpModule } from '../fmp/fmp.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { EmailFlowsModule } from '../email-flows/email-flows.module';
import { WealthTrackerController } from './wealth-tracker.controller';
import { WealthTrackerService } from './wealth-tracker.service';
import { RosterService } from './roster.service';
import { PtrService } from './ptr.service';
import { PricesService } from './prices.service';
import { Last10Service } from './last10.service';
import { UnifiedService } from './unified.service';
import { HouseArchiveService } from './house-archive.service';
import { TrackerVerificationService } from './verification.service';
import { FilingAlertsService } from './filing-alerts.service';

/** The Wealth Tracker — Developer Project Brief v7, Build 1 (politician
 *  portfolio reconstruction, rankings, badges, holdings). */
@Module({
  imports: [FmpModule, AuthModule, BillingModule, EmailFlowsModule, TypeOrmModule.forFeature([Company, User])],
  controllers: [WealthTrackerController],
  providers: [WealthTrackerService, RosterService, PtrService, PricesService, Last10Service, UnifiedService, HouseArchiveService, TrackerVerificationService, FilingAlertsService],
  exports: [WealthTrackerService, PtrService, PricesService, Last10Service, UnifiedService, HouseArchiveService, TrackerVerificationService, FilingAlertsService],
})
export class WealthTrackerModule {}
