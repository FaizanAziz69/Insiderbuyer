import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { Company } from '../entities/company.entity';
import { CongressionalController } from './congressional.controller';
import { CongressionalService } from './congressional.service';
import { PhotosService } from './photos.service';
import { FmpModule } from '../fmp/fmp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CongressionalTransaction, Company]),
    FmpModule,
  ],
  controllers: [CongressionalController],
  providers: [CongressionalService, PhotosService],
  exports: [CongressionalService, PhotosService],
})
export class CongressionalModule {}
