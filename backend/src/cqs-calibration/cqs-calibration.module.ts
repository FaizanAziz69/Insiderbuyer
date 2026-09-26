import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { CqsCalibrationController } from './cqs-calibration.controller';
import { CqsCalibrationService } from './cqs-calibration.service';

/** Brief v9 §5 — point-in-time walk, decile forward-return test and component
 *  ablation. Self-contained on purpose: it must never read the live scorer's
 *  current-state tables, which have no history to rewind. */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [CqsCalibrationController],
  providers: [CqsCalibrationService],
  exports: [CqsCalibrationService],
})
export class CqsCalibrationModule {}
