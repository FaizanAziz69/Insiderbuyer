import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EodClose } from '../entities/eod-close.entity';
import { FundamentalsCache } from '../entities/fundamentals-cache.entity';
import { MarketProfileSnapshot } from '../entities/market-profile.entity';
import { PeRatioCache } from '../entities/pe-ratio-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { FundamentalsCacheService } from './fundamentals-cache.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketStatsController } from './market-stats.controller';
import { MarketStatsService } from './market-stats.service';
import { PeCacheService } from './pe-cache.service';
import { PeriodBaselineService } from './period-baseline.service';
import { SymbolResolverService } from './symbol-resolver.service';
import { EdgarFundamentalsService } from './edgar-fundamentals.service';

@Module({
  imports: [
    FmpModule,
    TypeOrmModule.forFeature([PeRatioCache, MarketProfileSnapshot, FundamentalsCache, EodClose]),
  ],
  controllers: [MarketStatsController],
  providers: [MarketStatsService, PeCacheService, MarketSnapshotService, FundamentalsCacheService, PeriodBaselineService, SymbolResolverService, EdgarFundamentalsService],
  exports: [MarketStatsService, PeCacheService, MarketSnapshotService, FundamentalsCacheService, PeriodBaselineService, SymbolResolverService, EdgarFundamentalsService],
})
export class MarketStatsModule {}
