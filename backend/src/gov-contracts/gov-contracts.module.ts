import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { GovContractCache } from '../entities/gov-contract-cache.entity';
import { MarketStatsModule } from '../market-stats/market-stats.module';
import { FmpModule } from '../fmp/fmp.module';
import { IqsModule } from '../iqs/iqs.module';
import { GovContractsController } from './gov-contracts.controller';
import { GovContractsService } from './gov-contracts.service';
import { ContractorDiscoveryService } from './contractor-discovery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GovContractCache, Company]),
    MarketStatsModule,
    FmpModule,
    IqsModule,
  ],
  controllers: [GovContractsController],
  providers: [GovContractsService, ContractorDiscoveryService],
})
export class GovContractsModule {}
