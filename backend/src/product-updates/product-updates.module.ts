import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { ProductUpdatesController } from './product-updates.controller';
import { ProductUpdatesService } from './product-updates.service';

/** Product Updates email list — a welcome, then one feature email every few
 *  days for the site's main features (George 2026-09-16). Its own tables. */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [ProductUpdatesController],
  providers: [ProductUpdatesService],
  exports: [ProductUpdatesService],
})
export class ProductUpdatesModule {}
