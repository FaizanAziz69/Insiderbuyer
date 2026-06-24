import { Module } from '@nestjs/common';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { StockListsController } from './stock-lists.controller';
import { StockListsService } from './stock-lists.service';
import { ThirteenFService } from './thirteenf.service';
import { CongressionalModule } from '../congressional/congressional.module';

@Module({
  imports: [IqsModule, MarketStatsModule, CongressionalModule],
  controllers: [StockListsController],
  providers: [StockListsService, ThirteenFService],
  exports: [StockListsService],
})
export class StockListsModule {}
