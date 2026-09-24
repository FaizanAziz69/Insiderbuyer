import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqsScore } from '../entities/cqs-score.entity';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { IqsScore } from '../entities/iqs-score.entity';
import { Company } from '../entities/company.entity';
import { CqsService } from './cqs.service';
import { CqsController } from './cqs.controller';
import { CongressTradesModule } from '../congress-trades/congress-trades.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CqsScore,
      CongressionalTransaction,
      IqsScore,
      Company,
    ]),
    CongressTradesModule,
  ],
  providers: [CqsService],
  controllers: [CqsController],
  exports: [CqsService],
})
export class CqsModule {}
