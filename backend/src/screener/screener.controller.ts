import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { ScreenerService, ScreenerSetup } from './screener.service';

const SETUPS = new Set<ScreenerSetup>([
  'cluster-buy',
  'small-cap-cluster',
  'ceo-buy',
  'pre-earnings',
  'insider-buying',
]);

@Controller('screener')
export class ScreenerController {
  constructor(private readonly svc: ScreenerService) {}

  @Get()
  async screen(
    @Query('q') q?: string,
    @Query('sector') sector?: string,
    @Query('exchange') exchange?: string,
    @Query('minMarketCap') minMarketCap?: string,
    @Query('maxMarketCap') maxMarketCap?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minIqs') minIqs?: string,
    @Query('setup') setup?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const num = (v?: string) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
    return this.svc.screen({
      q,
      sector,
      exchange,
      minMarketCap: num(minMarketCap),
      maxMarketCap: num(maxMarketCap),
      minPrice: num(minPrice),
      maxPrice: num(maxPrice),
      minIqs: num(minIqs),
      setup: SETUPS.has(setup as ScreenerSetup) ? (setup as ScreenerSetup) : undefined,
      sort: (['iqs', 'marketCap', 'price', 'buyers', 'buyValue', 'symbol'].includes(sort || '')
        ? sort
        : undefined) as any,
      dir: dir === 'asc' ? 'asc' : 'desc',
      limit: num(limit),
      offset: num(offset),
    });
  }

  @Get('status')
  status() {
    return this.svc.status();
  }

  @Post('refresh')
  @UseGuards(AdminTokenGuard)
  refresh() {
    return this.svc.refresh();
  }
}
