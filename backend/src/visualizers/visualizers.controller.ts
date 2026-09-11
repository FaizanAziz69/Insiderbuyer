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
import { InsiderSnapshotService } from './insider-snapshot.service';
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
