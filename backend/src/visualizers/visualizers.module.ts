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
  VizPayloadCache,
} from '../entities/visualizer.entity';
import { Company } from '../entities/company.entity';
import { PressOrder } from '../entities/press-order.entity';
import { IrClientService } from './ir-client.service';
import { FmpModule } from '../fmp/fmp.module';
import { IndicesModule } from '../indices/indices.module';
import { GovVizService } from './gov-contracts-viz.service';
import { MiningService } from './mining.service';
import { BiotechService } from './biotech.service';
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
    FmpModule,
    IndicesModule,
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
      VizPayloadCache,
      Company,
      PressOrder,
    ]),
  ],
  controllers: [VisualizersController],
  providers: [
    RealtimeService,
    PredictionService,
    InsiderSnapshotService,
    GovVizService,
    MiningService,
    BiotechService,
    IrClientService,
  ],
  exports: [
    PredictionService,
    RealtimeService,
    InsiderSnapshotService,
    GovVizService,
    MiningService,
    BiotechService,
    IrClientService,
  ],
})
export class VisualizersModule {}
