import { Body, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { QuantService } from './quant.service';
import { QuantIngestService } from './ingest.service';
import { QuantBacktestService } from './backtest.service';
import { IndexService } from './index.service';
import { ExecutionService } from './execution.service';
import { PitService } from './pit.service';

/**
 * Brief v6 surface. Two public reads only — the index itself, which §10 makes
 * a publishable data product — and everything that can move capital or change
 * a parameter sits behind the admin token.
 */
@Controller('quant')
export class QuantController {
  constructor(
    private readonly quant: QuantService,
    private readonly ingest: QuantIngestService,
    private readonly backtest: QuantBacktestService,
    private readonly index: IndexService,
    private readonly execution: ExecutionService,
    private readonly pit: PitService,
  ) {}

  // ── Public: the index as a data product ──────────────────────────────

  @Get('index')
  @Header('Cache-Control', 'public, max-age=900')
  publicIndex() {
    return this.index.publicView();
  }

  // ── Research interface (admin) ───────────────────────────────────────

  @Get('status')
  @UseGuards(AdminTokenGuard)
  status() {
    return this.quant.status();
  }

  @Get('config')
  @UseGuards(AdminTokenGuard)
  config() {
    return this.quant.config();
  }

  @Post('config')
  @UseGuards(AdminTokenGuard)
  setConfig(@Body() body: any) {
    return this.quant.setConfig(body?.patch ?? body, body?.actor || 'admin');
  }

  @Get('rankings')
  @UseGuards(AdminTokenGuard)
  rankings(@Query('limit') limit?: string, @Query('snapshot') snapshot?: string, @Query('passedOnly') passedOnly?: string) {
    return this.quant.rankings({
      limit: limit ? Number(limit) : 100,
      snapshotId: snapshot,
      passedOnly: passedOnly === '1',
    });
  }

  /** Why a name ranks where it does (§4's research-interface requirement). */
  @Get('explain')
  @UseGuards(AdminTokenGuard)
  explain(@Query('symbol') symbol: string, @Query('asOf') asOf?: string) {
    return this.quant.explain(symbol, asOf);
  }

  @Get('books')
  @UseGuards(AdminTokenGuard)
  books() {
    return this.quant.bookState();
  }

  @Get('exclusions')
  @UseGuards(AdminTokenGuard)
  async exclusions() {
    return { symbols: Array.from(await this.quant.exclusions()).sort() };
  }

  @Post('exclusions')
  @UseGuards(AdminTokenGuard)
  addExclusion(@Body() body: { symbol: string; reason?: string; engagementEndedOn?: string | null; actor?: string }) {
    return this.quant
      .addExclusion(body.symbol, body.reason || 'agency/IR client', body.engagementEndedOn || null, body.actor || 'admin')
      .then(() => ({ ok: true }));
  }

  @Post('exclusions/remove')
  @UseGuards(AdminTokenGuard)
  removeExclusion(@Body() body: { symbol: string; actor?: string }) {
    return this.quant.removeExclusion(body.symbol, body.actor || 'admin').then(() => ({ ok: true }));
  }

  // ── L1 ingestion ─────────────────────────────────────────────────────

  @Post('admin/refresh-universe')
  @UseGuards(AdminTokenGuard)
  refreshUniverse() {
    return this.pit.refreshUniverse();
  }

  @Post('admin/ingest-fundamentals')
  @UseGuards(AdminTokenGuard)
  ingestFundamentals(@Query('limit') limit?: string, @Query('quarters') quarters?: string, @Query('activeOnly') activeOnly?: string) {
    return this.ingest.ingestFundamentals(limit ? Number(limit) : 250, quarters ? Number(quarters) : 44, activeOnly === '1');
  }

  @Post('admin/ingest-prices')
  @UseGuards(AdminTokenGuard)
  ingestPrices(@Query('limit') limit?: string, @Query('from') from?: string, @Query('activeOnly') activeOnly?: string) {
    return this.ingest.ingestPrices(limit ? Number(limit) : 250, from || '2006-01-01', activeOnly === '1');
  }

  /** Seed the §7.1 benchmark blend, without which capture ratios are null. */
  @Post('admin/ingest-benchmarks')
  @UseGuards(AdminTokenGuard)
  ingestBenchmarks(@Query('from') from?: string) {
    return this.ingest.ingestBenchmarks(from || '2006-01-01');
  }

  @Post('admin/ingest-marketcaps')
  @UseGuards(AdminTokenGuard)
  ingestMarketCaps(@Query('limit') limit?: string, @Query('activeOnly') activeOnly?: string, @Query('from') from?: string) {
    return this.ingest.ingestMarketCaps(limit ? Number(limit) : 200, activeOnly === '1', from || '2006-01-01');
  }

  // ── L2/L3 ────────────────────────────────────────────────────────────

  @Post('admin/run-ranking')
  @UseGuards(AdminTokenGuard)
  runRanking(@Query('asOf') asOf?: string, @Query('limit') limit?: string) {
    return this.quant.start({ asOf, limit: limit ? Number(limit) : undefined });
  }

  /** Rank at each quarter end across a span so the index has a curve. */
  @Post('admin/backfill-rankings')
  @UseGuards(AdminTokenGuard)
  backfillRankings(@Body() body: { from: string; to?: string; limit?: number }) {
    return this.quant.backfillRankings({ from: body?.from, to: body?.to, limit: body?.limit });
  }

  // ── §8 backtesting ───────────────────────────────────────────────────

  @Post('admin/backtest')
  @UseGuards(AdminTokenGuard)
  runBacktest(@Body() body: any) {
    return this.backtest.run({
      from: body?.from,
      to: body?.to,
      rebalanceDays: body?.rebalanceDays,
      configPatch: body?.configPatch,
      universeLimit: body?.universeLimit,
      costBps: body?.costBps,
      label: body?.label,
    });
  }

  @Post('admin/parameter-sweep')
  @UseGuards(AdminTokenGuard)
  sweep(@Body() body: any) {
    return this.backtest.sweep(
      { from: body?.from, to: body?.to, rebalanceDays: body?.rebalanceDays, universeLimit: body?.universeLimit, costBps: body?.costBps },
      body?.variants || [],
    );
  }

  // ── The index ────────────────────────────────────────────────────────

  @Post('admin/rebuild-index')
  @UseGuards(AdminTokenGuard)
  rebuildIndex(@Body() body: any) {
    return this.index.rebuild({ from: body?.from, to: body?.to });
  }

  // ── L4 execution ─────────────────────────────────────────────────────

  @Get('orders')
  @UseGuards(AdminTokenGuard)
  orders(@Query('book') book?: string, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.execution.queue(book, status || 'pending_approval', limit ? Number(limit) : 200);
  }

  @Post('orders/submit')
  @UseGuards(AdminTokenGuard)
  async submit(@Body() body: any) {
    const cfg = await this.quant.config();
    return this.execution.submit(body, cfg);
  }

  @Post('orders/approve')
  @UseGuards(AdminTokenGuard)
  approve(@Body() body: { orderId: string; actor?: string }) {
    return this.execution.approve(body.orderId, body.actor || 'george');
  }

  @Post('orders/cancel')
  @UseGuards(AdminTokenGuard)
  cancel(@Body() body: { orderId: string; actor?: string; reason?: string }) {
    return this.execution.cancel(body.orderId, body.actor || 'george', body.reason);
  }

  @Post('orders/fill-paper')
  @UseGuards(AdminTokenGuard)
  fillPaper(@Body() body: { orderId: string; price: number }) {
    return this.execution.fillPaper(body.orderId, body.price);
  }

  /** The kill switch is a config flag so it survives a restart. */
  @Post('admin/kill-switch')
  @UseGuards(AdminTokenGuard)
  async killSwitch(@Body() body: { on: boolean; actor?: string }) {
    const cfg = await this.quant.setConfig({ execution: { killSwitch: !!body.on } }, body.actor || 'admin');
    await this.execution.audit(body.on ? 'kill_switch.engaged' : 'kill_switch.released', { actor: body.actor || 'admin' });
    return { killSwitch: cfg.execution.killSwitch };
  }

  @Get('audit')
  @UseGuards(AdminTokenGuard)
  audit(@Query('limit') limit?: string, @Query('book') book?: string) {
    return this.execution.auditTrail(limit ? Number(limit) : 200, book);
  }
}
