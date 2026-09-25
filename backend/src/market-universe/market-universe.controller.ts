import { Body, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { MarketUniverseService } from './market-universe.service';

/**
 * The market-wide screening universe.
 *
 *  GET  /market-universe/status            coverage + staleness
 *  GET  /market-universe/screen?kind=lows  the 52-week screen behind the articles
 *  POST /market-universe/admin/refresh     rebuild (admin token)
 */
@Controller('market-universe')
export class MarketUniverseController {
  constructor(private readonly svc: MarketUniverseService) {}

  @Get('status')
  async status() {
    return this.svc.status();
  }

  @Get('screen')
  @Header('Cache-Control', 'public, max-age=900')
  async screen(
    @Query('kind') kind?: string,
    @Query('within') within?: string,
    @Query('limit') limit?: string,
    @Query('minMarketCap') minMarketCap?: string,
    @Query('sector') sector?: string,
  ) {
    const rows = await this.svc.screen({
      kind: kind === 'highs' ? 'highs' : 'lows',
      within: within ? Number(within) : undefined,
      limit: limit ? Number(limit) : undefined,
      minMarketCap: minMarketCap ? Number(minMarketCap) : undefined,
      sector: sector || undefined,
    });
    return { count: rows.length, rows };
  }

  @Post('admin/refresh')
  @UseGuards(AdminTokenGuard)
  async refresh(@Body() body?: { minMarketCap?: number; limit?: number }) {
    return this.svc.refresh(body || {});
  }
}
