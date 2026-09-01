import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { Iqs2Service } from './iqs2.service';
import { WEIGHTS_ALTERNATE, WEIGHTS_LAUNCH } from './config';

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

  /** The weight vectors in play, so the methodology page can render them. */
  @Get('weights')
  weights() {
    return { launch: WEIGHTS_LAUNCH, alternate: WEIGHTS_ALTERNATE };
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
