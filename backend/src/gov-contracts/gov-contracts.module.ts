import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GovContractCache } from '../entities/gov-contract-cache.entity';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { GovContractsController } from './gov-contracts.controller';
import { GovContractsService } from './gov-contracts.service';

@Module({
  imports: [TypeOrmModule.forFeature([GovContractCache]), MarketStatsModule],
  controllers: [GovContractsController],
  providers: [GovContractsService],
})
export class GovContractsModule {}
