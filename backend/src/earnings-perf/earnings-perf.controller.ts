import { Controller, Get, Post, Query } from '@nestjs/common';
import { EarningsPerfService } from './earnings-perf.service';

@Controller('earnings-performance')
export class EarningsPerfController {
  constructor(private readonly svc: EarningsPerfService) {}

  /** Upcoming earnings + each ticker's historical insider track record. */
  @Get('upcoming')
  async upcoming(@Query('days') days?: string) {
    const n = Math.min(14, Math.max(1, Number(days) || 7));
    return this.svc.getUpcoming(n);
  }

  /** Leaderboard by Insider Earnings Score. type = company | insider | sector */
  @Get('leaderboard')
  leaderboard(@Query('type') type?: string, @Query('limit') limit?: string) {
    const t = (['company', 'insider', 'sector'].includes(type as string)
      ? type
      : 'company') as 'company' | 'insider' | 'sector';
    return { type: t, rows: this.svc.getLeaderboard(t, Number(limit) || 25) };
  }

  @Get('status')
  status() {
    return this.svc.status();
  }

  /** Rebuild the backtest cache. Optional query overrides for tuning. */
  @Post('rebuild')
  async rebuild(
    @Query('lookbackDays') lookbackDays?: string,
    @Query('buyWindowDays') buyWindowDays?: string,
    @Query('reactionDays') reactionDays?: string,
    @Query('minSample') minSample?: string,
  ) {
    return this.svc.rebuild({
      lookbackDays: lookbackDays ? Number(lookbackDays) : undefined,
      buyWindowDays: buyWindowDays ? Number(buyWindowDays) : undefined,
      reactionDays: reactionDays ? Number(reactionDays) : undefined,
      minSample: minSample ? Number(minSample) : undefined,
    });
  }
}
