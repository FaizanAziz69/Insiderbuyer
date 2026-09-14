import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AwardsService } from './awards.service';
import { BoardRosterService } from './board-roster.service';
import { EntityResolutionService } from './entity-resolution.service';
import { FlagEngineService } from './flag-engine.service';
import { DisclosuresService } from './disclosures.service';
import { InfluenceMapService } from './influence-map.service';
import { VerificationAgentService } from './verification-agent.service';

/**
 * The daily loop — Brief v5 §2 ("Ingest … daily") and §7 P3, which sets a
 * 24-hour re-verification target for rows on the public leaderboard.
 *
 * Order is the pipeline's order and matters: awards before resolution before
 * flags, because each stage reads what the previous one wrote. Verification
 * runs last on the new rows, then again on the live ones, so a row published
 * yesterday is re-checked today whether or not anything new arrived.
 */
@Injectable()
export class CongressTradesCronService implements OnModuleInit {
  private readonly log = new Logger(CongressTradesCronService.name);

  constructor(
    private readonly influence: InfluenceMapService,
    private readonly awards: AwardsService,
    private readonly disclosures: DisclosuresService,
    private readonly vendors: EntityResolutionService,
    private readonly flags: FlagEngineService,
    private readonly board: BoardRosterService,
    private readonly agent: VerificationAgentService,
  ) {}

  async onModuleInit() {
    try {
      // Tables and the seed jurisdiction table exist from first boot, so an
      // admin opening the editor never meets an empty screen.
      await this.influence.ensureTables();
      await this.influence.seedIfEmpty();
      await this.awards.ensureTables();
      await this.disclosures.ensureTables();
      await this.vendors.ensureTables();
      await this.flags.ensureTables();
      await this.board.ensureTables();
      await this.agent.ensureTables();
    } catch (e: any) {
      this.log.error(`setup failed: ${e?.message || e}`);
    }
  }

  @Cron('40 5 * * *')
  async nightly() {
    try {
      await this.influence.refreshAssignments();
      // Leg 1 before leg 2: the engine needs the household record in place
      // before it looks for holders of a freshly-ingested award.
      await this.disclosures.ingest(6);
      await this.awards.ingest(14);
      await this.vendors.resolvePending(400);
      await this.flags.run(180);
      await this.board.run(180);
      await this.agent.verify(200, 'pending');
      await this.agent.triageReports(50);
    } catch (e: any) {
      this.log.error(`nightly pipeline failed: ${e?.message || e}`);
    }
  }

  /** §7 P3: "live-row re-verification meets the 24h latency target". Every
   *  six hours is four passes a day — enough headroom that a slow pass does
   *  not put the oldest row past the target. */
  @Cron('20 */6 * * *')
  async reverify() {
    try {
      await this.agent.verify(150, 'live', 'daily');
    } catch (e: any) {
      this.log.error(`re-verification failed: ${e?.message || e}`);
    }
  }

  /**
   * §2 Stage 5's second tier: "weekly for archive". Once a day, a slice of the
   * rows that are verified but below the leaderboard, oldest first — seven
   * passes rotate the archive through inside the week the brief asks for,
   * without competing with the daily tier for the model budget.
   */
  @Cron('10 3 * * *')
  async reverifyArchive() {
    try {
      await this.agent.verify(300, 'live', 'weekly');
    } catch (e: any) {
      this.log.error(`archive re-verification failed: ${e?.message || e}`);
    }
  }
}
