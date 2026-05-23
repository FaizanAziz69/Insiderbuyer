import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { SecClient } from './sec.client';
import { QuoteClient } from './quote.client';
import { IqsModule } from '../iqs/iqs.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company, InsiderTransaction]), IqsModule],
  controllers: [IngestionController],
  providers: [IngestionService, SecClient, QuoteClient],
})
export class IngestionModule {}
