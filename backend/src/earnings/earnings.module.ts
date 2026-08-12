import { Module } from '@nestjs/common';
import { FmpModule } from '../fmp/fmp.module';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

@Module({
  // FMP supplies the EPS estimates Nasdaq's calendar leaves blank.
  imports: [FmpModule],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
