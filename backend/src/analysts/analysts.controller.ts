import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  /** Top Analyst Stocks — stocks covered by ≥5 analysts whose measured success
   *  rate clears 70%, ranked on that coverage and their average price target
   *  (client rule 2026-08-24). Public and cheap: a stored payload re-priced
   *  from the market snapshot on read. */
  @Get('top-stocks')
  async topStocks(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.svc.getTopAnalystStocks(Number.isFinite(n) && n > 0 ? n : 50);
  }

  /** Qualification diagnostics for the list above (coverage depth, analyst
   *  pool, where the cut falls) — a thin list should be explainable. */
  @Get('top-stocks/status')
  async topStocksStatus() {
    return this.svc.topAnalystStocksStatus();
  }

  /** One analyst's rating history (for the name-click popup on Top Analysts —
   *  most recent first; no standalone profile pages per client spec). */
  @Get(':slug/ratings')
  async ratings(@Param('slug') slug: string, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.svc.getAnalystRatings(slug, Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 20);
  }

  /** Manual accumulation tick (also runs on the daily cron). Accumulates notes
   *  and recomputes the persisted leaderboard; the wider budget here is safe
   *  because nothing else shares this invocation, unlike the cron. */
  @Post('refresh')
  @UseGuards(AdminTokenGuard)
  async refresh(@Body() body?: { boardBudgetMs?: number }) {
    const b = Number(body?.boardBudgetMs);
    return this.svc.refresh(Number.isFinite(b) && b > 0 ? Math.min(b, 45_000) : 40_000);
  }

  /** Deep per-symbol history backfill (paid FMP price-target-news). */
  @Post('backfill-history')
  @UseGuards(AdminTokenGuard)
  async backfillHistory(@Body() body: { symbols?: string[]; pages?: number }) {
    return this.svc.backfillHistory(body?.symbols, body?.pages ?? 3);
  }
}
