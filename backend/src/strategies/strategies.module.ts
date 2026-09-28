import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { PremiumAccessModule } from '../common/premium-access.module';
import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';
import { StrategyBacktestService } from './strategy-backtest.service';
import { StrategyDataService } from './strategy-data.service';
import { StrategiesCron } from './strategies.cron';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), FmpModule, PremiumAccessModule],
  providers: [StrategiesService, StrategyBacktestService, StrategyDataService, StrategiesCron],
  controllers: [StrategiesController],
  exports: [StrategiesService],
})
export class StrategiesModule {}
