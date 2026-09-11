import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  VizBiotechCatalyst,
  VizBiotechProfile,
  VizBiotechTrial,
  VizContractAward,
  VizCuratedMarket,
  VizEntity,
  VizGovRecipient,
  VizMarketContract,
  VizMiningProject,
} from '../entities/visualizer.entity';
import { Company } from '../entities/company.entity';
import { InsiderSnapshotService } from './insider-snapshot.service';
import { PredictionService } from './prediction.service';
import { RealtimeService } from './realtime.service';
import { VisualizersController } from './visualizers.controller';

/**
 * Bubble Visualizer Suite (Developer Brief v2). One module for all four
 * verticals: they share the entity table, the realtime gateway and the
 * controller surface, which is the whole point of §3.1 "build once, reuse
 * four times".
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VizEntity,
      VizCuratedMarket,
      VizMarketContract,
      VizGovRecipient,
      VizContractAward,
      VizMiningProject,
      VizBiotechCatalyst,
      VizBiotechTrial,
      VizBiotechProfile,
      Company,
    ]),
  ],
  controllers: [VisualizersController],
  providers: [RealtimeService, PredictionService, InsiderSnapshotService],
  exports: [PredictionService, RealtimeService, InsiderSnapshotService],
})
export class VisualizersModule {}
