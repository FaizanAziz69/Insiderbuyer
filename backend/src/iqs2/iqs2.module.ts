import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { Iqs2Controller } from './iqs2.controller';
import { Iqs2Service } from './iqs2.service';

/** IQS 2.0 — Insider Score rebuild (brief 2026-09-01). Shadow-only in Phase 2. */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [Iqs2Controller],
  providers: [Iqs2Service],
  exports: [Iqs2Service],
})
export class Iqs2Module {}
