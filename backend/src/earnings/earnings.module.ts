import { Module } from '@nestjs/common';
import { FmpModule } from '../fmp/fmp.module';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';
import { EarningsSignalsService } from './earnings-signals.service';

@Module({
  // FMP supplies the EPS estimates Nasdaq's calendar leaves blank. Iqs +
  // MarketStats feed the per-row signals (insider $ flows, quotes, targets).
  imports: [FmpModule, IqsModule, MarketStatsModule],
  controllers: [EarningsController],
  providers: [EarningsService, EarningsSignalsService],
  exports: [EarningsService],
})
export class EarningsModule {}
