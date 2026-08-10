import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalystPriceTarget } from '../entities/analyst-target.entity';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { AnalystsController } from './analysts.controller';
import { AnalystsService } from './analysts.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnalystPriceTarget, Company]), FmpModule, MarketStatsModule],
  controllers: [AnalystsController],
  providers: [AnalystsService],
  exports: [AnalystsService],
})
export class AnalystsModule {}
