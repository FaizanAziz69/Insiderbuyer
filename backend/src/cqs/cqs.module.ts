import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqsScore } from '../entities/cqs-score.entity';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { Company } from '../entities/company.entity';
import { CqsService } from './cqs.service';
import { CqsController } from './cqs.controller';
import { CqsCronService } from './cqs.cron';
import { CongressTradesModule } from '../congress-trades/congress-trades.module';
import { PremiumAccessModule } from '../common/premium-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CqsScore, CongressionalTransaction, Company]),
    CongressTradesModule,
    PremiumAccessModule,
  ],
  providers: [CqsService, CqsCronService],
  controllers: [CqsController],
  exports: [CqsService],
})
export class CqsModule {}
