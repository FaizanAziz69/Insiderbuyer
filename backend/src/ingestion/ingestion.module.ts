import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { ProcessedFiling } from '../entities/processed-filing.entity';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { SecClient } from './sec.client';
import { QuoteClient } from './quote.client';
import { BafinClient } from './bafin.client';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, InsiderTransaction, ProcessedFiling]),
    IqsModule,
    MarketStatsModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionService, SecClient, QuoteClient, BafinClient],
})
export class IngestionModule {}
