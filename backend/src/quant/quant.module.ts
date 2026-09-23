import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { QuantController } from './quant.controller';
import { QuantService } from './quant.service';
import { PitService } from './pit.service';
import { QuantIngestService } from './ingest.service';
import { QuantBacktestService } from './backtest.service';
import { IndexService } from './index.service';
import { ExecutionService } from './execution.service';

/** Brief v6 — Quant Fund & Proprietary Index (L1-L4). */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [QuantController],
  providers: [QuantService, PitService, QuantIngestService, QuantBacktestService, IndexService, ExecutionService],
  exports: [QuantService, PitService, IndexService],
})
export class QuantModule {}
