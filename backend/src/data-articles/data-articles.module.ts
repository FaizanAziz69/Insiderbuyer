import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { AnalystsModule } from '../analysts/analysts.module';
import { InvestorsModule } from '../investors/investors.module';
import { CongressTradesModule } from '../congress-trades/congress-trades.module';
import { MarketUniverseModule } from '../market-universe/market-universe.module';
import { DataArticlesController } from './data-articles.controller';
import { DataArticlesService } from './data-articles.service';
import { StockProfileService } from './stock-profile.service';

/** Evergreen, auto-refreshing data articles (Developer Project Brief,
 *  Workstream A): four launch articles, chart payload per article per period. */
@Module({
  imports: [FmpModule, AnalystsModule, InvestorsModule, CongressTradesModule, MarketUniverseModule, TypeOrmModule.forFeature([Company])],
  controllers: [DataArticlesController],
  providers: [DataArticlesService, StockProfileService],
  exports: [DataArticlesService],
})
export class DataArticlesModule {}
