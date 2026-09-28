import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { FmpModule } from '../fmp/fmp.module';
import { PremiumAccessModule } from '../common/premium-access.module';
import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';
import { StrategyBacktestService } from './strategy-backtest.service';
import { StrategyDataService } from './strategy-data.service';
import { StrategiesCron } from './strategies.cron';
import { StrategyAlertsService } from './strategy-alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company, Subscriber]), FmpModule, PremiumAccessModule],
  providers: [StrategiesService, StrategyBacktestService, StrategyDataService, StrategiesCron, StrategyAlertsService],
  controllers: [StrategiesController],
  exports: [StrategiesService],
})
export class StrategiesModule {}
