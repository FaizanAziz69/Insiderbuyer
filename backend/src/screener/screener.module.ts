import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScreenerUniverseCache } from '../entities/screener-universe-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { IqsModule } from '../iqs/iqs.module';
import { EaiModule } from '../eai/eai.module';
import { EarningsModule } from '../earnings/earnings.module';
import { ScreenerController } from './screener.controller';
import { ScreenerService } from './screener.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScreenerUniverseCache]),
    FmpModule,
    IqsModule,
    EaiModule,
    EarningsModule,
  ],
  controllers: [ScreenerController],
  providers: [ScreenerService],
  exports: [ScreenerService],
})
export class ScreenerModule {}
