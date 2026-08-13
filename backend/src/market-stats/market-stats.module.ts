import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeRatioCache } from '../entities/pe-ratio-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { MarketStatsController } from './market-stats.controller';
import { MarketStatsService } from './market-stats.service';
import { PeCacheService } from './pe-cache.service';

@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([PeRatioCache])],
  controllers: [MarketStatsController],
  providers: [MarketStatsService, PeCacheService],
  exports: [MarketStatsService, PeCacheService],
})
export class MarketStatsModule {}
