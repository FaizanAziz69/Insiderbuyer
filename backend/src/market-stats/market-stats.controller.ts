import { Controller, Get, Query } from '@nestjs/common';
import { MarketStatsService } from './market-stats.service';

@Controller('market-stats')
export class MarketStatsController {
  constructor(private readonly svc: MarketStatsService) {}

  @Get('top-gainers')
  async gainers(@Query('limit') limit?: string) {
    const rows = await this.svc.getTopGainers(limit ? Number(limit) : 20);
    return { rows };
  }

  @Get('top-losers')
  async losers(@Query('limit') limit?: string) {
    const rows = await this.svc.getTopLosers(limit ? Number(limit) : 20);
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
  async analystRatings() {
    return { rows: await this.svc.getAnalystRatings() };
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
