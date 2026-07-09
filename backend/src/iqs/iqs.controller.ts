import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IqsService } from './iqs.service';

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the rankings CSV with explicit, human-readable columns. We map each
 *  ranking row to named fields (ticker + company name, never the internal
 *  companyId) rather than dumping Object.keys, which keeps the column order
 *  stable and avoids leaking the company UUID. */
function rankingsToCsv(rows: any[]): string {
  const columns: { header: string; value: (r: any) => any }[] = [
    { header: 'Rank', value: (r) => r.rank },
    { header: 'Ticker', value: (r) => r.ticker },
    { header: 'Company', value: (r) => r.name },
    { header: 'Sector', value: (r) => r.sector },
    { header: 'Insider Score', value: (r) => r.iqs },
    { header: 'Insiders Buying', value: (r) => r.distinctBuyers },
    { header: 'Transactions', value: (r) => r.transactionCount },
    { header: '$ Bought', value: (r) => r.totalPurchaseValue },
    { header: 'Market Cap', value: (r) => r.marketCap },
    { header: 'Last Price', value: (r) => r.lastPrice },
    { header: 'Avg Insider Cost', value: (r) => r.avgCost ?? '' },
    { header: 'Last Buy Date', value: (r) => r.lastBuyDate ?? '' },
  ];
  const head = columns.map((c) => csvEscape(c.header)).join(',');
  const body = rows
    .map((r) => columns.map((c) => csvEscape(c.value(r))).join(','))
    .join('\n');
  return head + '\n' + body;
}

@Controller()
export class IqsController {
  constructor(private readonly iqs: IqsService) {}

  @Get('rankings')
  async rankings(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sector') sector?: string,
    @Query('minMarketCap') minMc?: string,
    @Query('maxMarketCap') maxMc?: string,
    @Query('minIqs') minIqs?: string,
    @Query('country') country?: string,
    @Query('live') live?: string,
  ) {
    return this.iqs.getRankings({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      sector: sector || undefined,
      minMarketCap: minMc ? Number(minMc) : undefined,
      maxMarketCap: maxMc ? Number(maxMc) : undefined,
      minIqs: minIqs ? Number(minIqs) : undefined,
      country: country || undefined,
      withLive: live === '1' || live === 'true',
    });
  }

  /** Recompute every IQS score (pulls live prices/market caps/52-week ranges
   *  for the formula). Lighter than a full SEC ingestion. */
  @Post('recalculate')
  async recalculate() {
    const updated = await this.iqs.recalculateAll();
    return { updated };
  }

  @Get('metrics/buy-sell')
  async buySell() {
    return this.iqs.getMonthlyBuySellMeter();
  }

  @Get('metrics/sector-flows')
  async sectorFlows(@Query('days') days?: string) {
    const n = Math.min(365, Math.max(7, Number(days) || 30));
    return this.iqs.getSectorFlows(n);
  }

  @Get('predictions/today')
  async predictionToday() {
    return this.iqs.getPredictionOfTheDay();
  }

  @Get('rankings.csv')
  async rankingsCsv(@Res() res: Response) {
    // Export the FULL ranking set, not a tiny default page. First read the
    // total, then request that many rows (capped by the service) so the CSV
    // matches what the rankings/trades pages list.
    const probe = await this.iqs.getRankings({ limit: 1, offset: 0 });
    const { rows } = await this.iqs.getRankings({
      limit: Math.max(probe.total, 1),
      offset: 0,
    });
    const csv = rankingsToCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="iqs-rankings-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Get('companies/:ticker')
  async company(@Param('ticker') ticker: string) {
    const detail = await this.iqs.getCompanyDetail(ticker);
    if (!detail) return { error: 'Not found' };
    return detail;
  }

  /** Composite 0–100 score (insider + analyst pillars; sentiment slot wired
   *  for a future provider) with the per-pillar breakdown. */
  @Get('scores/:ticker')
  async compositeScore(@Param('ticker') ticker: string) {
    return this.iqs.getCompositeScore(ticker);
  }

  /** "Top Stocks" ranking — analyst ratings + Insider Score + insider success
   *  rate blended into one 0–99 conviction score (see composite-score.ts). */
  @Get('top-stocks')
  async topStocks(@Query('limit') limit?: string) {
    const rows = await this.iqs.getTopStocks(limit ? Number(limit) : 200);
    return { rows };
  }

  @Get('dashboard')
  async dashboard() {
    return this.iqs.getDashboard();
  }

  @Get('trades')
  async trades(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('side') side?: string,
    @Query('month') month?: string,
  ) {
    return this.iqs.getAllTrades({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q: q || undefined,
      side: side === 'buy' || side === 'sell' || side === 'all' ? side : undefined,
      month: month === '1' || month === 'true',
    });
  }

  @Get('insiders')
  async insiders(@Query('limit') limit?: string, @Query('country') country?: string) {
    return this.iqs.getTopInsiders(limit ? Number(limit) : 20, country || undefined);
  }

  @Get('insiders/countries')
  async insiderCountries() {
    return { countries: await this.iqs.getInsiderCountries() };
  }

  @Get('insiders/track-record')
  async insiderTrackRecord(@Query('limit') limit?: string) {
    return { rows: await this.iqs.getInsiderTrackRecords(limit ? Number(limit) : 8) };
  }

  @Get('charts/volume')
  async volumeChart(@Query('days') days?: string) {
    const n = Math.min(365, Math.max(7, Number(days) || 30));
    return this.iqs.getVolumeSeries(n);
  }

  @Get('ideas')
  async ideas() {
    return this.iqs.getIdeas();
  }

  @Get('health')
  health() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
