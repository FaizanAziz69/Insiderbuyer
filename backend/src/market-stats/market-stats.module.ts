import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FundamentalsCache } from '../entities/fundamentals-cache.entity';
import { MarketProfileSnapshot } from '../entities/market-profile.entity';
import { PeRatioCache } from '../entities/pe-ratio-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { FundamentalsCacheService } from './fundamentals-cache.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketStatsController } from './market-stats.controller';
import { MarketStatsService } from './market-stats.service';
import { PeCacheService } from './pe-cache.service';

@Module({
  imports: [
    FmpModule,
    TypeOrmModule.forFeature([PeRatioCache, MarketProfileSnapshot, FundamentalsCache]),
  ],
  controllers: [MarketStatsController],
  providers: [MarketStatsService, PeCacheService, MarketSnapshotService, FundamentalsCacheService],
  exports: [MarketStatsService, PeCacheService, MarketSnapshotService, FundamentalsCacheService],
})
export class MarketStatsModule {}
