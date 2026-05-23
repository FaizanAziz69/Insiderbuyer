import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { IqsScore } from '../entities/iqs-score.entity';
import { IqsService } from './iqs.service';
import { IqsController } from './iqs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, InsiderTransaction, IqsScore])],
  controllers: [IqsController],
  providers: [IqsService],
  exports: [IqsService],
})
export class IqsModule {}
