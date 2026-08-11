import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { BacktestService } from './backtest.service';

@Controller('backtest')
export class BacktestController {
  constructor(private readonly svc: BacktestService) {}

  /** Insider-buying strategy backtest computed from our own Form 4 history. */
  @Get('insider-strategy')
  async insiderStrategy() {
    return this.svc.get();
  }

  /** Populate the 10-year insider-purchase event store (paid FMP). */
  @Post('backfill-buys')
  @UseGuards(AdminTokenGuard)
  async backfillBuys(@Body() body: { pages?: number; limit?: number; offset?: number }) {
    return this.svc.backfillBuyEvents({
      maxPagesPerSymbol: body?.pages,
      limit: body?.limit,
      offset: body?.offset,
    });
  }
}
