import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IqsService } from './iqs.service';

function toCsv(rows: any[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.join(',');
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(',')).join('\n');
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
    const { rows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
    const csv = toCsv(rows);
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
