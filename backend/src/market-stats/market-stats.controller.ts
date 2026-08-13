import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketStatsService } from './market-stats.service';
import { PeCacheService } from './pe-cache.service';

@Controller('market-stats')
export class MarketStatsController {
  constructor(
    private readonly svc: MarketStatsService,
    private readonly peCache: PeCacheService,
    private readonly snapshot: MarketSnapshotService,
  ) {}

  /** Refill `market_profile_snapshot` from FMP's bulk profiles — the licensed
   *  source behind the movers tables and heatmaps. */
  @Post('snapshot-refresh')
  @UseGuards(AdminTokenGuard)
  async snapshotRefresh() {
    const result = await this.snapshot.refresh();
    return { ...result, status: await this.snapshot.status() };
  }

  @Get('snapshot-status')
  async snapshotStatus() {
    return this.snapshot.status();
  }

  /** Which filter emptied the snapshot read — diagnostics for fallback cases. */
  @Get('snapshot-diagnose')
  async snapshotDiagnose() {
    return this.snapshot.diagnose();
  }

  /** Intraday refresh target for the Vercel cron (every 30m during US market
   *  hours). Stale-checked for the same reason as pe-cron below, but with a
   *  window matched to that cadence — the movers read path rejects a snapshot
   *  older than 90 minutes, so a daily window would leave it permanently
   *  falling back to the scrape. */
  @Get('snapshot-cron')
  async snapshotCron() {
    return this.snapshot.refreshIfStale(20 * 60_000);
  }

  /** Refill `pe_ratio_cache` from FMP's bulk TTM ratios. Guarded: it is one
   *  ~70MB download and a few thousand upserts, so it must not be an open
   *  endpoint. Safe to re-run — a failed fetch leaves the existing rows alone. */
  @Post('pe-refresh')
  @UseGuards(AdminTokenGuard)
  async peRefresh() {
    const result = await this.peCache.refresh();
    return { ...result, status: await this.peCache.status() };
  }

  /** Row count + last write time, so coverage can be checked without a refresh. */
  @Get('pe-status')
  async peStatus() {
    return this.peCache.status();
  }

  /** Daily refresh target for the Vercel cron (crons issue a plain GET, so this
   *  cannot be token-guarded). Re-fetches only when the table is stale, which
   *  is also what keeps a public URL from pulling the bulk feed on every hit. */
  @Get('pe-cron')
  async peCron() {
    return this.peCache.refreshIfStale();
  }

  @Get('search')
  async search(@Query('q') q?: string, @Query('limit') limit?: string) {
    const rows = await this.svc.searchSymbols(q || '', limit ? Number(limit) : 8);
    return { rows };
  }

  @Get('top-gainers')
  async gainers(@Query('limit') limit?: string) {
    const rows = await this.svc.getTopGainers(limit ? Number(limit) : 1000);
    return { rows };
  }

  @Get('top-losers')
  async losers(@Query('limit') limit?: string) {
    const rows = await this.svc.getTopLosers(limit ? Number(limit) : 1000);
    return { rows };
  }

  @Get('most-active')
  async active(@Query('limit') limit?: string) {
    const rows = await this.svc.getMostActive(limit ? Number(limit) : 20);
    return { rows };
  }

  @Get('quotes')
  async quotes(@Query('symbols') symbols?: string) {
    const syms = (symbols || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 200);
    const map = await this.svc.getQuoteBatch(syms);
    // Preserve requested order.
    const rows = syms.map((s) => map.get(s)).filter(Boolean);
    return { rows };
  }

  @Get('stats')
  async stats(@Query('symbol') symbol?: string) {
    if (!symbol) return { stats: null };
    return { stats: await this.svc.getStockStats(symbol) };
  }

  /** 7-day close sparklines for stock listings. */
  @Get('spark')
  async spark(@Query('symbols') symbols?: string) {
    const syms = (symbols || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 60);
    return { spark: await this.svc.getSparklines(syms) };
  }

  /** Multi-period % returns for the heatmap time-period toggle. */
  @Get('performance')
  async performance(@Query('symbols') symbols?: string) {
    const syms = (symbols || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 150);
    return { returns: await this.svc.getReturns(syms) };
  }

  /** stockanalysis.com-style detail tabs. */
  @Get('profile')
  async profile(@Query('symbol') symbol?: string) {
    if (!symbol) return { profile: null };
    return { profile: await this.svc.getProfile(symbol) };
  }

  @Get('financials')
  async financials(@Query('symbol') symbol?: string) {
    if (!symbol) return { financials: null };
    return { financials: await this.svc.getFinancials(symbol) };
  }

  @Get('history')
  async history(
    @Query('symbol') symbol?: string,
    @Query('range') range?: string,
  ) {
    if (!symbol) return { history: null };
    return { history: await this.svc.getPriceHistory(symbol, range || '1y') };
  }

  @Get('heatmap')
  async heatmap() {
    return { rows: await this.svc.getMarketHeatmap() };
  }

  @Get('analyst-ratings')
  async analystRatings(@Query('symbols') symbols?: string) {
    const syms = (symbols || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    return { rows: await this.svc.getAnalystRatings(syms.length ? syms : undefined) };
  }

  @Get('analyst-firms')
  async analystFirms(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.svc.getAnalystFirms(Number.isFinite(n) && n > 0 ? Math.min(n, 250) : 100);
  }

  @Get('statements')
  async statements(@Query('symbol') symbol?: string) {
    if (!symbol) return { income: [], balance: [], cashflow: [] };
    return this.svc.getQuarterlyStatements(symbol);
  }

  @Get('forecast')
  async forecast(@Query('symbol') symbol?: string) {
    if (!symbol) return null;
    return this.svc.getForecast(symbol);
  }

  @Get('etf-holders')
  async etfHolders(@Query('symbol') symbol?: string) {
    if (!symbol) return { rows: [] };
    return { rows: await this.svc.getEtfHolders(symbol) };
  }

  @Get('dividends')
  async dividends() {
    return { rows: await this.svc.getDividends() };
  }

  @Get('short-interest')
  async shortInterest() {
    return { rows: await this.svc.getShortInterest() };
  }
}
