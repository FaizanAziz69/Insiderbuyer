import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HotSectorsCache } from '../entities/hot-sectors-cache.entity';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { StockListsController } from './stock-lists.controller';
import { StockListsService } from './stock-lists.service';
import { ThirteenFService } from './thirteenf.service';
import { CongressionalModule } from '../congressional/congressional.module';
import { FmpModule } from '../fmp/fmp.module';
import { SecClient } from '../ingestion/sec.client';

@Module({
  // FmpModule: fills the sector / market-cap / P/E cells our own tables don't
  // carry (penny screener names, non-US listings) with real reported data.
  imports: [
    TypeOrmModule.forFeature([HotSectorsCache]),
    IqsModule,
    MarketStatsModule,
    CongressionalModule,
    FmpModule,
  ],
  controllers: [StockListsController],
  providers: [StockListsService, ThirteenFService, SecClient],
  exports: [StockListsService],
})
export class StockListsModule {}
