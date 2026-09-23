import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { User } from '../entities/user.entity';
import { FmpModule } from '../fmp/fmp.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { WealthTrackerController } from './wealth-tracker.controller';
import { WealthTrackerService } from './wealth-tracker.service';
import { RosterService } from './roster.service';
import { PtrService } from './ptr.service';
import { PricesService } from './prices.service';
import { Last10Service } from './last10.service';
import { UnifiedService } from './unified.service';

/** The Wealth Tracker — Developer Project Brief v7, Build 1 (politician
 *  portfolio reconstruction, rankings, badges, holdings). */
@Module({
  imports: [FmpModule, AuthModule, BillingModule, TypeOrmModule.forFeature([Company, User])],
  controllers: [WealthTrackerController],
  providers: [WealthTrackerService, RosterService, PtrService, PricesService, Last10Service, UnifiedService],
  exports: [WealthTrackerService, PtrService, PricesService, Last10Service, UnifiedService],
})
export class WealthTrackerModule {}
