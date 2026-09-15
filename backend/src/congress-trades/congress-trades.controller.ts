import {
  Body, Controller, Get, Header, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { AwardsService } from './awards.service';
import { BoardRosterService } from './board-roster.service';
import { EntityResolutionService } from './entity-resolution.service';
import { FlagEngineService } from './flag-engine.service';
import { InfluenceMapService } from './influence-map.service';
import { VerificationAgentService } from './verification-agent.service';
import { CongressAlertsService } from './alerts.service';
import { DisclosuresService } from './disclosures.service';
import { AMOUNT_NOTE, CTS_DEFAULT_WEIGHTS, STANDING_FRAME } from './cts';

/**
 * Top Ranking Congress Trades API — Brief v5 §4.
 *
 * Public reads serve ONLY verified rows; the engine, the queues and the
 * jurisdiction table sit behind the admin token. The standing frame (§5) is
 * returned with every public payload rather than left to each surface to
 * remember, because a page that forgets it is a page that publishes a ranked
 * list of named politicians with no context at all.
 */
@Controller('congress-trades')
export class CongressTradesController {
  constructor(
    private readonly flags: FlagEngineService,
    private readonly awards: AwardsService,
    private readonly vendors: EntityResolutionService,
    private readonly influence: InfluenceMapService,
    private readonly agent: VerificationAgentService,
    private readonly board: BoardRosterService,
    private readonly alerts: CongressAlertsService,
    private readonly disclosures: DisclosuresService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────

  /** §4: the flagship leaderboard, ordered by CTS. */
  @Get('leaderboard')
  @Header('Cache-Control', 'public, max-age=300')
  async leaderboard(
    @Query('limit') limit?: string,
    @Query('chamber') chamber?: string,
    @Query('party') party?: string,
    @Query('agency') agency?: string,
    @Query('committee') committee?: string,
    @Query('minScore') minScore?: string,
  ) {
    const rows = await this.flags.leaderboard({
      limit: Number(limit) || undefined,
      chamber, party, agency, committee,
      minScore: minScore != null && minScore !== '' ? Number(minScore) : undefined,
    });
    return { rows, frame: STANDING_FRAME, amountNote: AMOUNT_NOTE, weights: await this.flags.weights() };
  }

  /** §4: 'Contract proximity' block on a politician profile. */
  @Get('member/:name')
  @Header('Cache-Control', 'public, max-age=300')
  async member(@Param('name') name: string) {
    return {
      member: name,
      rows: await this.flags.forMember(decodeURIComponent(name)),
      frame: STANDING_FRAME,
      amountNote: AMOUNT_NOTE,
    };
  }

  /** §4: 'Government contracts + congressional holders' block on a stock page. */
  @Get('ticker/:ticker')
  @Header('Cache-Control', 'public, max-age=300')
  async ticker(@Param('ticker') ticker: string) {
    return {
      ticker: ticker.toUpperCase(),
      rows: await this.flags.forTicker(ticker),
      frame: STANDING_FRAME,
      amountNote: AMOUNT_NOTE,
    };
  }

  /**
   * §5's corrections channel. Public on purpose: "a visible 'report an error'
   * path on every flag … Fast, documented corrections are the defamation
   * defense that matters."
   */
  @Post('report')
  async report(@Body() body: { flagId?: number; message?: string; email?: string }) {
    return this.agent.report(
      body?.flagId ? Number(body.flagId) : null,
      String(body?.message || ''),
      body?.email,
    );
  }

  @Get('status')
  async status() {
    const [flags, awards, vendors, influence, agent, board, alerts] = await Promise.all([
      this.flags.status(), this.awards.status(), this.vendors.coverage(),
      this.influence.status(), this.agent.status(), this.board.status(), this.alerts.status(),
    ]);
    return {
      flags, awards, vendorResolution: vendors, influence, agent, board, alerts,
      defaultWeights: CTS_DEFAULT_WEIGHTS,
    };
  }

  // ── Pipeline (admin) ───────────────────────────────────────────────────

  @Post('admin/refresh-influence')
  @UseGuards(AdminTokenGuard)
  async refreshInfluence() {
    await this.influence.seedIfEmpty();
    return { seats: await this.influence.refreshAssignments() };
  }

  /**
   * Stage 1's other half — the trades themselves.
   *
   * This was the one stage with no manual trigger. Every other stage had one,
   * the nightly cron called this in the right order, and so a hand-run
   * pipeline quietly produced a complete award side and an empty trade side:
   * 757 awards, 101 of them mapped to a listed company, and zero flags,
   * because there was nothing to match them against. Nothing errored.
   */
  @Post('admin/ingest-disclosures')
  @UseGuards(AdminTokenGuard)
  async ingestDisclosures(@Query('pages') pages?: string) {
    return this.disclosures.ingest(Number(pages) || undefined);
  }

  @Post('admin/ingest-awards')
  @UseGuards(AdminTokenGuard)
  async ingestAwards(@Query('days') days?: string, @Query('pages') pages?: string) {
    return this.awards.ingest(Number(days) || undefined, Number(pages) || undefined);
  }

  @Post('admin/resolve-vendors')
  @UseGuards(AdminTokenGuard)
  async resolveVendors(@Query('limit') limit?: string) {
    return this.vendors.resolvePending(Number(limit) || undefined);
  }

  @Post('admin/run-engine')
  @UseGuards(AdminTokenGuard)
  async runEngine(@Query('days') days?: string) {
    return this.flags.run(Number(days) || undefined);
  }

  @Post('admin/run-board')
  @UseGuards(AdminTokenGuard)
  async runBoard(@Query('days') days?: string) {
    return this.board.run(Number(days) || undefined);
  }

  /** §2 Stage 5 re-checks the public leaderboard daily and the archive weekly,
   *  so `tier` selects which of the two a live pass works through. */
  @Post('admin/verify')
  @UseGuards(AdminTokenGuard)
  async verify(
    @Query('limit') limit?: string,
    @Query('mode') mode?: string,
    @Query('tier') tier?: string,
  ) {
    return this.agent.verify(
      Number(limit) || undefined,
      mode === 'live' ? 'live' : 'pending',
      tier === 'weekly' ? 'weekly' : 'daily',
    );
  }

  /** §4 alerts: premium email plus the internal editorial Slack feed. */
  @Post('admin/send-alerts')
  @UseGuards(AdminTokenGuard)
  async sendAlerts(@Query('limit') limit?: string) {
    return this.alerts.run(Number(limit) || undefined);
  }

  /** §7 P3: "alert threshold configurable". */
  @Put('admin/alert-threshold')
  @UseGuards(AdminTokenGuard)
  async setAlertThreshold(@Body() body: { minScore?: number; actor?: string }) {
    return this.alerts.setThreshold(Number(body?.minScore), body?.actor || 'admin');
  }

  @Post('admin/triage-reports')
  @UseGuards(AdminTokenGuard)
  async triage(@Query('limit') limit?: string) {
    return this.agent.triageReports(Number(limit) || undefined);
  }

  // ── Config (§8: George's items) ────────────────────────────────────────

  @Put('admin/weights')
  @UseGuards(AdminTokenGuard)
  async setWeights(@Body() body: Record<string, any>) {
    const { actor, ...rest } = body || {};
    return this.flags.setWeights(rest, actor || 'admin');
  }

  @Put('admin/config')
  @UseGuards(AdminTokenGuard)
  async setConfig(@Body() body: Record<string, any>) {
    const { actor, ...rest } = body || {};
    return this.awards.setConfig(rest, actor || 'admin');
  }

  // ── Jurisdiction table (§8: Faizan builds, editorial populates) ────────

  @Get('admin/jurisdiction')
  @UseGuards(AdminTokenGuard)
  async jurisdiction(@Query('version') version?: string) {
    return {
      version: Number(version) || (await this.influence.currentVersion()),
      rules: await this.influence.rules(Number(version) || undefined),
    };
  }

  @Put('admin/jurisdiction')
  @UseGuards(AdminTokenGuard)
  async editJurisdiction(@Body() body: { actor?: string; changes?: any[] }) {
    return this.influence.editJurisdiction(body?.changes || [], body?.actor || 'admin');
  }

  // ── Queues ─────────────────────────────────────────────────────────────

  @Get('admin/vendor-queue')
  @UseGuards(AdminTokenGuard)
  async vendorQueue(@Query('limit') limit?: string) {
    return this.vendors.queue(Number(limit) || undefined);
  }

  @Post('admin/vendor-queue/:key')
  @UseGuards(AdminTokenGuard)
  async decideVendor(@Param('key') key: string, @Body() body: any) {
    return this.vendors.decide(key, body || {}, body?.actor || 'admin');
  }

  @Get('admin/review-queue')
  @UseGuards(AdminTokenGuard)
  async reviewQueue(@Query('limit') limit?: string) {
    return this.agent.reviewQueue(Number(limit) || undefined);
  }

  @Post('admin/review-queue/:id')
  @UseGuards(AdminTokenGuard)
  async resolveQueued(@Param('id') id: string, @Body() body: any) {
    return this.agent.resolveQueued(
      Number(id),
      body?.decision === 'retire' ? 'retire' : body?.decision === 'dismiss' ? 'dismiss' : 'publish',
      body?.actor || 'admin',
      body?.note,
    );
  }

  @Get('admin/audit')
  @UseGuards(AdminTokenGuard)
  async audit(@Query('flagId') flagId?: string, @Query('limit') limit?: string) {
    return this.agent.audits(flagId ? Number(flagId) : undefined, Number(limit) || undefined);
  }

  // ── Stage 4 roster (admin-curated, §6) ────────────────────────────────

  @Get('admin/officials')
  @UseGuards(AdminTokenGuard)
  async officials(@Query('limit') limit?: string) {
    return this.board.roster(Number(limit) || undefined);
  }

  @Put('admin/officials')
  @UseGuards(AdminTokenGuard)
  async upsertOfficial(@Body() body: any) {
    return this.board.upsertOfficial(body || {}, body?.actor || 'admin');
  }

  @Put('admin/board-seats')
  @UseGuards(AdminTokenGuard)
  async upsertSeat(@Body() body: any) {
    return this.board.upsertSeat(body || {}, body?.actor || 'admin');
  }

  /**
   * §6's filing sources, read for a company and PROPOSED. Nothing this returns
   * is in the roster: an editor still has to decide that a named director is
   * an ex-official and which agency they oversaw.
   */
  @Post('admin/board-candidates')
  @UseGuards(AdminTokenGuard)
  async importBoardCandidates(@Query('ticker') ticker?: string, @Query('max') max?: string) {
    return this.board.importCandidates(String(ticker || ''), Number(max) || undefined);
  }

  @Get('admin/board-candidates')
  @UseGuards(AdminTokenGuard)
  async boardCandidates(@Query('state') state?: string, @Query('limit') limit?: string) {
    return this.board.candidates(state || 'pending', Number(limit) || undefined);
  }

  @Post('admin/board-candidates/:id/dismiss')
  @UseGuards(AdminTokenGuard)
  async dismissBoardCandidate(@Param('id') id: string, @Body() body: any) {
    return this.board.dismissCandidate(Number(id), body?.actor || 'admin');
  }
}
