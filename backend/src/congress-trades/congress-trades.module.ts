import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { CongressTradesController } from './congress-trades.controller';
import { AwardsService } from './awards.service';
import { BoardRosterService } from './board-roster.service';
import { EntityResolutionService } from './entity-resolution.service';
import { FlagEngineService } from './flag-engine.service';
import { InfluenceMapService } from './influence-map.service';
import { VerificationAgentService } from './verification-agent.service';
import { CongressTradesCronService } from './congress-trades.cron';

/** Top Ranking Congress Trades — Developer Project Brief v5.
 *  Congressional trades × committee jurisdiction × federal contract awards,
 *  scored by the CTS and gated by the Stage 5 verification agent. */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [CongressTradesController],
  providers: [
    AwardsService,
    EntityResolutionService,
    InfluenceMapService,
    FlagEngineService,
    VerificationAgentService,
    BoardRosterService,
    CongressTradesCronService,
  ],
  exports: [FlagEngineService],
})
export class CongressTradesModule {}
