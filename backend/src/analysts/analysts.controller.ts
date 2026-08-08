import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { AnalystsService } from './analysts.service';

@Controller('analysts')
export class AnalystsController {
  constructor(private readonly svc: AnalystsService) {}

  /** Individual named analysts ranked by measured performance. */
  @Get('top')
  async top(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.svc.getTopAnalysts(Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50);
  }

  /** Manual accumulation tick (also runs on the daily cron). */
  @Post('refresh')
  @UseGuards(AdminTokenGuard)
  async refresh() {
    return this.svc.refresh();
  }

  /** Deep per-symbol history backfill (paid FMP price-target-news). */
  @Post('backfill-history')
  @UseGuards(AdminTokenGuard)
  async backfillHistory(@Body() body: { symbols?: string[]; pages?: number }) {
    return this.svc.backfillHistory(body?.symbols, body?.pages ?? 3);
  }
}
