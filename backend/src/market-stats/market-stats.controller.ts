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
}
