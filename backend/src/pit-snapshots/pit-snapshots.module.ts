import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { PitSnapshotsController } from './pit-snapshots.controller';
import { PitSnapshotsService } from './pit-snapshots.service';

/** Dated snapshots of the current-state tables Brief v9 §5 cannot otherwise
 *  score historically. Company is injected only for its DataSource. */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [PitSnapshotsController],
  providers: [PitSnapshotsService],
  exports: [PitSnapshotsService],
})
export class PitSnapshotsModule {}
