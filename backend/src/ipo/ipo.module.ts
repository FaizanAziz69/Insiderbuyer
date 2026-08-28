import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { IpoController } from './ipo.controller';
import { IpoService } from './ipo.service';

/** IPO Calendar — trailing-90-day listings with daily post-close prices and
 *  the Form 4 insider-buy flag (Developer Project Brief, Workstream E). */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company])],
  controllers: [IpoController],
  providers: [IpoService],
  exports: [IpoService],
})
export class IpoModule {}
