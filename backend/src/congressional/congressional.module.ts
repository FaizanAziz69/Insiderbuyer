import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { Company } from '../entities/company.entity';
import { CongressionalController } from './congressional.controller';
import { CongressionalService } from './congressional.service';
import { CivicService } from './civic.service';
import { PhotosService } from './photos.service';
import { FmpModule } from '../fmp/fmp.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CongressionalTransaction, Company]),
    FmpModule,
    MarketStatsModule,
  ],
  controllers: [CongressionalController],
  providers: [CongressionalService, CivicService, PhotosService],
  exports: [CongressionalService, PhotosService],
})
export class CongressionalModule {}
