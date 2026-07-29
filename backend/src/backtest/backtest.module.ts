import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';

@Module({
  imports: [TypeOrmModule.forFeature([InsiderTransaction]), MarketStatsModule],
  controllers: [BacktestController],
  providers: [BacktestService],
  exports: [BacktestService],
})
export class BacktestModule {}
