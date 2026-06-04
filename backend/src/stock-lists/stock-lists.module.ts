import { Module } from '@nestjs/common';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { StockListsController } from './stock-lists.controller';
import { StockListsService } from './stock-lists.service';

@Module({
  imports: [IqsModule, MarketStatsModule],
  controllers: [StockListsController],
  providers: [StockListsService],
  exports: [StockListsService],
})
export class StockListsModule {}
