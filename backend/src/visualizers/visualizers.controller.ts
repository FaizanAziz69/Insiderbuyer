import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { STAGES as STAGES_LIST } from './mining.service';
import {
  GovVizService,
  type CachedPayload,
  type Region,
  type Window,
} from './gov-contracts-viz.service';
import { InsiderSnapshotService } from './insider-snapshot.service';
import { MiningService } from './mining.service';
import { BiotechService } from './biotech.service';
import { PredictionService } from './prediction.service';
import { RealtimeService } from './realtime.service';

/**
 * The suite's client-facing API (§3.1 Real-time Gateway + REST).
 *
 * Everything under /api/visualizers. Reads are public and cacheable at the
 * edge; the stream is explicitly uncacheable; writes are admin-token guarded
 * because they are the curation layer (§7.2).
 */
@Controller('visualizers')
export class VisualizersController {
  constructor(
    private readonly prediction: PredictionService,
    private readonly realtime: RealtimeService,
    private readonly insider: InsiderSnapshotService,
    private readonly gov: GovVizService,
    private readonly mining: MiningService,
    private readonly biotech: BiotechService,
  ) {}

  /** §3.4 the shared Insider Intelligence block, for any vertical's panel. */
  @Get('insider/:ticker')
  @Header('Cache-Control', 'public, max-age=300')
  insiderSnapshot(@Param('ticker') ticker: string) {
    return this.insider.get(ticker);
  }

  /* ------------------------------------------------- prediction markets */

  /** First-paint snapshot. Short max-age: the stream carries the movement, so
   *  a few seconds of shared cache costs nothing and absorbs traffic spikes. */
  @Get('markets')
  @Header('Cache-Control', 'public, max-age=5, stale-while-revalidate=30')
  markets() {
    return this.prediction.snapshot();
  }

  /**
   * §3.1 the push channel. Server-Sent Events: one long-lived response per
   * client, coalesced 1/second frames from RealtimeService.
   */
  @Get('markets/stream')
  stream(@Req() req: Request, @Res() res: Response) {
    const detach = this.realtime.subscribe('markets', res);
    // Seed the connection so a client that misses the first tick is not blank.
    res.write(`event: hello\ndata: ${JSON.stringify(this.prediction.status())}\n\n`);
    req.on('close', detach);
  }

  /** §7.5 biggest movers — feeds the newsletter and the X account. */
  @Get('markets/movers')
  @Header('Cache-Control', 'public, max-age=60')
  movers(@Query('limit') limit?: string) {
    return this.prediction.movers(Math.min(Number(limit) || 10, 25));
  }

  @Get('markets/status')
  status() {
    return this.prediction.status();
  }

  @Get('markets/:id/history')
  @Header('Cache-Control', 'public, max-age=30')
  history(@Param('id') id: string, @Query('interval') interval?: string) {
    return this.prediction.history(id, interval || '1w');
  }

  @Get('markets/:id/trades')
  @Header('Cache-Control', 'public, max-age=5')
  trades(@Param('id') id: string) {
    return this.prediction.trades(id);
  }

  @Get('markets/:id')
  @Header('Cache-Control', 'public, max-age=5')
  market(@Param('id') id: string) {
    return this.prediction.one(id) ?? { error: 'not found' };
  }

  /* ------------------------------------------------- government contracts */

  @Get('contracts')
  @Header('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
  contracts(
    @Query('region') region?: string,
    @Query('window') window?: string,
  ): Promise<CachedPayload | { empty: true }> {
    const r: Region = region === 'ca' || region === 'global' ? region : 'us';
    const w: Window = window === '90d' ? '90d' : '1y';
    return this.gov.read(r, w);
  }

  @Get('contracts/status')
  contractsStatus() {
    return this.gov.status();
  }

  @Get('contracts/:id/awards')
  @Header('Cache-Control', 'public, max-age=1800')
  contractAwards(@Param('id') id: string, @Query('window') window?: string) {
    return this.gov.awards(decodeURIComponent(id), window === '90d' ? '90d' : '1y');
  }

  @Post('admin/contracts/refresh')
  @UseGuards(AdminTokenGuard)
  refreshContracts(@Query('region') region?: string, @Query('window') window?: string) {
    if (region === 'us' || region === 'ca') {
      return this.gov.build(region, window === '90d' ? '90d' : '1y');
    }
    return this.gov.refreshAll();
  }

  @Get('admin/contracts/recipients')
  @UseGuards(AdminTokenGuard)
  listRecipients(@Query('limit') limit?: string) {
    return this.gov.listRecipients(Math.min(Number(limit) || 300, 2000));
  }

  /** §6.3 the manual override pass — never re-guessed by an automated run. */
  @Post('admin/contracts/recipients/:id')
  @UseGuards(AdminTokenGuard)
  setRecipient(
    @Param('id') id: string,
    @Body() body: { ticker?: string | null; exchange?: string | null; isPublic?: boolean },
  ) {
    return this.gov.setRecipient(decodeURIComponent(id), body ?? {});
  }

  /* ------------------------------------------------------- goldminer */

  @Get('mining')
  @Header('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600')
  miningProjects() {
    return this.mining.list();
  }

  @Get('mining/status')
  async miningStatus() {
    return { projects: await this.mining.count(), stages: STAGES_LIST };
  }

  /** §9.6 seed tooling. Accepts a JSON array or a CSV body; rejects any row
   *  that cannot carry its own source, rather than importing a blank. */
  @Post('admin/mining/import')
  @UseGuards(AdminTokenGuard)
  async importMining(
    @Body() body: { rows?: Record<string, unknown>[]; csv?: string; replace?: boolean },
  ) {
    const rows = body?.csv ? this.mining.parseCsv(body.csv) : (body?.rows ?? []);
    return this.mining.importRows(rows, { replace: !!body?.replace });
  }

  /** Dry run: the same validator, no write. */
  @Post('admin/mining/validate')
  @UseGuards(AdminTokenGuard)
  validateMining(@Body() body: { rows?: Record<string, unknown>[]; csv?: string }) {
    const rows = body?.csv ? this.mining.parseCsv(body.csv) : (body?.rows ?? []);
    const { ok, issues } = this.mining.validate(rows);
    return { valid: ok.length, rejected: rows.length - ok.length, issues };
  }

  /* --------------------------------------------------------- biotech */

  @Get('biotech')
  @Header('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600')
  biotechMap() {
    return this.biotech.read();
  }

  @Get('biotech/status')
  biotechStatus() {
    return this.biotech.status();
  }

  @Post('admin/biotech/refresh')
  @UseGuards(AdminTokenGuard)
  refreshBiotech(@Query('step') step?: string) {
    if (step === 'roster') return this.biotech.refreshRoster();
    if (step === 'geocode') return this.biotech.geocodeMissing(60);
    if (step === 'trials') return this.biotech.refreshTrials(60);
    if (step === 'financials') return this.biotech.refreshFinancials(60);
    if (step === 'build') return this.biotech.build();
    return this.biotech.refreshAll();
  }

  @Post('admin/biotech/catalysts')
  @UseGuards(AdminTokenGuard)
  importCatalysts(@Body() body: { rows?: Record<string, unknown>[] }) {
    return this.biotech.importCatalysts(Array.isArray(body?.rows) ? body.rows : []);
  }

  /* --------------------------------------------------------- curation */

  @Get('admin/curated')
  @UseGuards(AdminTokenGuard)
  listCurated() {
    return this.prediction.listCurated();
  }

  @Post('admin/curated')
  @UseGuards(AdminTokenGuard)
  async saveCurated(@Body() body: { rows?: unknown[] }) {
    const rows = Array.isArray(body?.rows) ? body.rows : [body];
    const n = await this.prediction.upsertCurated(rows as never);
    return { saved: n };
  }

  @Delete('admin/curated/:id')
  @UseGuards(AdminTokenGuard)
  async dropCurated(@Param('id') id: string) {
    return { removed: await this.prediction.removeCurated(id) };
  }

  @Post('admin/markets/refresh')
  @UseGuards(AdminTokenGuard)
  async refreshMarkets() {
    const catalog = await this.prediction.refreshCatalog();
    const poll = await this.prediction.poll();
    await this.prediction.flush();
    return { catalog, poll, status: this.prediction.status() };
  }
}
