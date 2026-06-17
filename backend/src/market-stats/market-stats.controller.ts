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
      .slice(0, 30);
    const map = await this.svc.getQuoteBatch(syms);
    // Preserve requested order.
    const rows = syms.map((s) => map.get(s)).filter(Boolean);
    return { rows };
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
