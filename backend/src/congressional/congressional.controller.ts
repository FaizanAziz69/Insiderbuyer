import { Controller, Get, Param, Query } from '@nestjs/common';
import { CongressionalService } from './congressional.service';

@Controller('congressional-trades')
export class CongressionalController {
  constructor(private readonly svc: CongressionalService) {}

  @Get()
  async list(
    @Query('ticker') ticker?: string,
    @Query('politician') politician?: string,
    @Query('chamber') chamber?: 'House' | 'Senate',
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const rows = await this.svc.list({
      ticker,
      politician,
      chamber: chamber === 'Senate' || chamber === 'House' ? chamber : undefined,
      days: days ? Number(days) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { total: rows.length, rows };
  }

  @Get('by-ticker/:ticker')
  async byTicker(@Param('ticker') ticker: string) {
    const rows = await this.svc.byTicker(ticker);
    return { total: rows.length, rows };
  }
}
