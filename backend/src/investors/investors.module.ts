import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { InvestorsController } from './investors.controller';
import { InvestorsService } from './investors.service';

/** Top Insiders — hedge-fund / famous-investor tracking off quarterly 13F
 *  filings (Developer Project Brief, Workstream B). */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [InvestorsController],
  providers: [InvestorsService],
  exports: [InvestorsService],
})
export class InvestorsModule {}
