import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { EaiCache } from '../entities/eai-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { EarningsModule } from '../earnings/earnings.module';
import { EaiController } from './eai.controller';
import { EaiService } from './eai.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, InsiderTransaction, EaiCache]),
    FmpModule,
    EarningsModule,
  ],
  controllers: [EaiController],
  providers: [EaiService],
  exports: [EaiService],
})
export class EaiModule {}
