import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketProfileSnapshot } from '../entities/market-profile.entity';
import { PeRatioCache } from '../entities/pe-ratio-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketStatsController } from './market-stats.controller';
import { MarketStatsService } from './market-stats.service';
import { PeCacheService } from './pe-cache.service';

@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([PeRatioCache, MarketProfileSnapshot])],
  controllers: [MarketStatsController],
  providers: [MarketStatsService, PeCacheService, MarketSnapshotService],
  exports: [MarketStatsService, PeCacheService, MarketSnapshotService],
})
export class MarketStatsModule {}
