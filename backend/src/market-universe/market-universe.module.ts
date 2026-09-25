import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { MarketUniverseController } from './market-universe.controller';
import { MarketUniverseService } from './market-universe.service';

/** Market-wide screening universe — the surface `companies` cannot serve,
 *  because that table only holds issuers whose insiders file. */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [MarketUniverseController],
  providers: [MarketUniverseService],
  exports: [MarketUniverseService],
})
export class MarketUniverseModule {}
