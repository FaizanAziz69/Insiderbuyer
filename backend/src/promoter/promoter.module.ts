import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { PromoterController } from './promoter.controller';
import { PromoterService } from './promoter.service';
import { IrDiscoveryService } from './ir-discovery.service';

/** IR Budget / Promoter Score — Developer Project Brief v2, Workstream F.
 *  TSXV/CSE investor-relations agreements, parsed from the Policy 3.4 news
 *  releases, scored per issuer per quarter, and sold as a B2B feed. */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [PromoterController],
  providers: [PromoterService, IrDiscoveryService],
  exports: [PromoterService],
})
export class PromoterModule {}
