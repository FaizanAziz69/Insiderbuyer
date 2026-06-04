import { Module } from '@nestjs/common';
import { MarketStatsController } from './market-stats.controller';
import { MarketStatsService } from './market-stats.service';

@Module({
  controllers: [MarketStatsController],
  providers: [MarketStatsService],
  exports: [MarketStatsService],
})
export class MarketStatsModule {}
