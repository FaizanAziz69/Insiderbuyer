import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { Iqs2Service } from './iqs2.service';
import { WEIGHTS_ALTERNATE, WEIGHTS_LAUNCH } from './config';
import { BADGES, BADGE_PRIORITY, TRADE_GRADE_DISCLAIMER } from './trade-grade';

/**
 * IQS 2.0 endpoints. During Phase 2 the score is SHADOW ONLY — nothing here
 * feeds a public ranking. `status` and `explain` are public because they are
 * the transparency surface the brief calls "the trust product"; recompute is
 * admin-only because it is expensive.
 */
@Controller('iqs2')
export class Iqs2Controller {
  constructor(private readonly svc: Iqs2Service) {}

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /** Every counted and excluded transaction for a ticker, with its inputs. */
  @Get('explain/:ticker')
  async explain(@Param('ticker') ticker: string) {
    return this.svc.explain(ticker);
  }

  /**
   * Top Insider Buys — the ranked transaction list. Public: the page it feeds
   * is a browse surface, and the grade is a characteristic of a public filing.
   */
  @Get('top-buys')
  async topBuys(
    @Query('period') period?: string,
    @Query('grade') grade?: string,
    @Query('badge') badge?: string,
    @Query('sector') sector?: string,
    @Query('minMarketCap') minMc?: string,
    @Query('maxMarketCap') maxMc?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.topBuys({
      period: period === '24h' || period === '30d' ? period : '7d',
      grade: grade === 'A' || grade === 'B' ? grade : undefined,
      badge: badge || undefined,
      sector: sector || undefined,
      minMarketCap: minMc ? Number(minMc) : undefined,
      maxMarketCap: maxMc ? Number(maxMc) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Grades + badges for one ticker's filings (ticker-page column). */
  @Get('grades/:ticker')
  async grades(@Param('ticker') ticker: string) {
    return this.svc.gradesForTicker(ticker);
  }

  /** Badge definitions and the required disclaimer, for rendering surfaces. */
  @Get('badges')
  badges() {
    return { badges: BADGES, priority: BADGE_PRIORITY, disclaimer: TRADE_GRADE_DISCLAIMER };
  }

  /** The weight vectors in play, so the methodology page can render them. */
  @Get('weights')
  weights() {
    return { launch: WEIGHTS_LAUNCH, alternate: WEIGHTS_ALTERNATE };
  }

  /**
   * Publish the latest IQS 2.0 run into the score every page reads
   * (iqs_scores.iqs). Admin-only and immediately reversible via
   * POST /iqs/recalculate, which rewrites the same columns from the v1 model.
   */
  @Post('publish')
  @UseGuards(AdminTokenGuard)
  async publish() {
    return this.svc.publish();
  }

  /** Force a shadow recompute. `alt=1` runs the 25/20 comparison vector. */
  @Post('recompute')
  @UseGuards(AdminTokenGuard)
  async recompute(
    @Query('asOf') asOf?: string,
    @Query('limit') limit?: string,
    @Query('alt') alt?: string,
    @Body() body?: { asOf?: string; limit?: number },
  ) {
    return this.svc.computeAll({
      asOf: asOf || body?.asOf,
      limit: limit ? Number(limit) : body?.limit,
      weights: alt === '1' || alt === 'true' ? WEIGHTS_ALTERNATE : WEIGHTS_LAUNCH,
    });
  }
}
