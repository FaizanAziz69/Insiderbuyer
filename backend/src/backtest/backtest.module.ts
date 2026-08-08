import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { Company } from '../entities/company.entity';
import { HistoricalInsiderBuy } from '../entities/historical-insider-buy.entity';
import { FmpModule } from '../fmp/fmp.module';
import {
  BacktestCache,
  PriceHistoryCache,
} from '../entities/backtest-cache.entity';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';

@Module({
  imports: [TypeOrmModule.forFeature([
      InsiderTransaction,
      Company,
      HistoricalInsiderBuy,
      PriceHistoryCache,
      BacktestCache,
    ]), MarketStatsModule, FmpModule],
  controllers: [BacktestController],
  providers: [BacktestService],
  exports: [BacktestService],
})
export class BacktestModule {}
