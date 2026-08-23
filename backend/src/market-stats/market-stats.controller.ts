import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { FundamentalsCacheService } from './fundamentals-cache.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketStatsService } from './market-stats.service';
import { PeCacheService } from './pe-cache.service';

@Controller('market-stats')
export class MarketStatsController {
  constructor(
    private readonly svc: MarketStatsService,
    private readonly peCache: PeCacheService,
    private readonly snapshot: MarketSnapshotService,
    private readonly fundamentals: FundamentalsCacheService,
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

  /**
   * Daily refresh target for the Vercel cron (crons issue a plain GET, so this
   * cannot be token-guarded). Re-fetches only when the table is stale, which is
   * also what keeps a public URL from pulling the bulk feeds on every hit.
   *
   * Both bulk refreshes run here rather than from separate cron entries: this
   * project is on a plan that allows two cron jobs at daily granularity, and
   * the SEC ingest already owns one of them. The snapshot runs second so a
   * failure there cannot cost us the P/E refresh.
   */
  @Get('pe-cron')
  async peCron() {
    const pe = await this.peCache.refreshIfStale();
    let snapshot: unknown;
    try {
      snapshot = await this.snapshot.refreshIfStale();
    } catch (e: any) {
      snapshot = { error: String(e?.message || e) };
    }
    // Fundamentals ride the same daily cron slot (the plan allows two cron
    // jobs and both are taken). Last in the chain and try-caught, so a failure
    // here cannot cost the P/E or snapshot refreshes — and vice versa.
    let fundamentals: unknown;
    try {
      fundamentals = await this.fundamentals.refreshIfStale();
    } catch (e: any) {
      fundamentals = { error: String(e?.message || e) };
    }
    return { pe, snapshot, fundamentals };
  }

  /** Refill `fundamentals_cache` (float + analyst price-target summary) from
   *  FMP's bulk feeds. Guarded like pe-refresh: multi-megabyte downloads and
   *  thousands of upserts must not sit on an open endpoint. */
  @Post('fundamentals-refresh')
  @UseGuards(AdminTokenGuard)
  async fundamentalsRefresh() {
    const result = await this.fundamentals.refresh();
    return { ...result, status: await this.fundamentals.status() };
  }

  @Get('fundamentals-status')
  async fundamentalsStatus() {
    return this.fundamentals.status();
  }

  /** Refresh target for the GitHub workflow (plain GET, so it cannot be
   *  token-guarded) — the staleness window is what stops a public URL from
   *  triggering the bulk downloads on every hit, same as pe-cron. */
  @Get('fundamentals-cron')
  async fundamentalsCron() {
    return this.fundamentals.refreshIfStale();
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
    const rows = await this.svc.getMarketHeatmap();
    // Full-precision floats ("changePct": -0.98224807) nearly double a ~4k-row
    // payload for digits no tile can render. Rounding cuts the raw JSON ~40%,
    // which is the difference between a blank-then-pop treemap and an instant
    // one on slow links. Precision kept: prices 3dp, percents 2dp, counts int.
    const r2 = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
    const r3 = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v;
    const int = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v;
    return {
      rows: rows.map((r: any) => ({
        ...r,
        price: r3(r.price),
        changeAbs: r3(r.changeAbs),
        changePct: r2(r.changePct),
        volume: int(r.volume),
        avgVolume: int(r.avgVolume),
        avgVol10d: int(r.avgVol10d),
        marketCap: int(r.marketCap),
        fiftyTwoWeekHigh: r2(r.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: r2(r.fiftyTwoWeekLow),
        peRatio: r2(r.peRatio),
        dividendYield: r3(r.dividendYield),
        dividendRate: r3(r.dividendRate),
        perfYear: r2(r.perfYear),
        perf50d: r2(r.perf50d),
        perf200d: r2(r.perf200d),
        postMarketPct: r2(r.postMarketPct),
      })),
    };
  }

  /** Cumulative sector returns for the rotation chart — real FMP data. */
  @Get('sector-rotation')
  async sectorRotation(@Query('days') days?: string) {
    const n = Number(days);
    return { rows: await this.svc.getSectorRotation(Number.isFinite(n) && n > 0 ? n : 90) };
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

  @Get('earnings-history')
  async earningsHistory(@Query('symbol') symbol?: string) {
    if (!symbol) return { rows: [] };
    return this.svc.getEarningsHistory(symbol);
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
