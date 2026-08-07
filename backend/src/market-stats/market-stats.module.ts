import { Module } from '@nestjs/common';
import { FmpModule } from '../fmp/fmp.module';
import { MarketStatsController } from './market-stats.controller';
import { MarketStatsService } from './market-stats.service';

@Module({
  imports: [FmpModule],
  controllers: [MarketStatsController],
  providers: [MarketStatsService],
  exports: [MarketStatsService],
})
export class MarketStatsModule {}
