import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BubblesCache, BubblesTickerMeta } from '../entities/bubbles-cache.entity';
import { FmpModule } from '../fmp/fmp.module';
import { BubblesController } from './bubbles.controller';
import { BubblesService } from './bubbles.service';

@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([BubblesCache, BubblesTickerMeta])],
  controllers: [BubblesController],
  providers: [BubblesService],
  exports: [BubblesService],
})
export class BubblesModule {}
