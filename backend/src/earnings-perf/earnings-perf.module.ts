import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { EarningsEvent } from '../entities/earnings-event.entity';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { EarningsModule } from '../earnings/earnings.module';
import { EarningsPerfController } from './earnings-perf.controller';
import { EarningsPerfService } from './earnings-perf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, InsiderTransaction, EarningsEvent]),
    MarketStatsModule,
    EarningsModule,
  ],
  controllers: [EarningsPerfController],
  providers: [EarningsPerfService],
  exports: [EarningsPerfService],
})
export class EarningsPerfModule {}
