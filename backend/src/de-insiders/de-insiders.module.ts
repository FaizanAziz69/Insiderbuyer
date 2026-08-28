import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { DeInsidersController } from './de-insiders.controller';
import { DeInsidersService } from './de-insiders.service';

/** BaFin Directors' Dealings → companies + insider_transactions, so German
 *  insider trades flow through every existing surface (bubbles Germany
 *  filter, data articles, trades feed). */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [DeInsidersController],
  providers: [DeInsidersService],
  exports: [DeInsidersService],
})
export class DeInsidersModule {}
