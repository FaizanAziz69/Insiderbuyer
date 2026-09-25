import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { LegislativeCalendarController } from './legislative-calendar.controller';
import { LegislativeCalendarService } from './legislative-calendar.service';

/** Scheduled committee activity, so Brief v9 §3's Legislative Catalyst has
 *  something to read. Senate needs no key; the House needs CONGRESS_API_KEY. */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [LegislativeCalendarController],
  providers: [LegislativeCalendarService],
  exports: [LegislativeCalendarService],
})
export class LegislativeCalendarModule {}
