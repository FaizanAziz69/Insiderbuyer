import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { FmpModule } from '../fmp/fmp.module';
import { Subscriber } from '../entities/subscriber.entity';
import { CongressTradesController } from './congress-trades.controller';
import { AwardsService } from './awards.service';
import { BoardRosterService } from './board-roster.service';
import { EntityResolutionService } from './entity-resolution.service';
import { FlagEngineService } from './flag-engine.service';
import { InfluenceMapService } from './influence-map.service';
import { VerificationAgentService } from './verification-agent.service';
import { CongressTradesCronService } from './congress-trades.cron';
import { DisclosuresService } from './disclosures.service';
import { CongressAlertsService } from './alerts.service';

/** Top Ranking Congress Trades — Developer Project Brief v5.
 *  Congressional trades × committee jurisdiction × federal contract awards,
 *  scored by the CTS and gated by the Stage 5 verification agent. */
@Module({
  imports: [FmpModule, TypeOrmModule.forFeature([Company, Subscriber])],
  controllers: [CongressTradesController],
  providers: [
    AwardsService,
    DisclosuresService,
    EntityResolutionService,
    InfluenceMapService,
    FlagEngineService,
    VerificationAgentService,
    BoardRosterService,
    CongressAlertsService,
    CongressTradesCronService,
  ],
  exports: [FlagEngineService],
})
export class CongressTradesModule {}
