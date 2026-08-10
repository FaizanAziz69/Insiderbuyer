import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CongressionalService } from './congressional.service';

@Controller('congressional-trades')
export class CongressionalController {
  constructor(private readonly svc: CongressionalService) {}

  /** Re-ingest from FMP (or seed if unavailable). Lets prod repopulate an
   *  empty table without a redeploy. */
  @Post('refresh')
  async refresh() {
    return this.svc.refresh();
  }

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

  /** Full profile for one member of Congress (by exact name). */
  @Get('profile')
  async profile(@Query('name') name?: string) {
    const profile = name ? await this.svc.getPoliticianProfile(name) : null;
    if (!profile) return { error: 'Unknown politician', profile: null };
    return { profile };
  }

  /** QuiverQuant-style member leaderboard (party, title, committees,
   *  portfolio value, win rate, profitable buys, holdings, headshot). */
  @Get('top-politicians')
  async topPoliticians(@Query('limit') limit?: string) {
    const n = Number(limit);
    const rows = await this.svc.getTopPoliticians(Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 60);
    return { rows };
  }

  /** Recompute + persist the politician leaderboard (cloud cron calls this so
   *  user requests read a warm cache instead of paying the ~20s compute). */
  @Post('refresh-politicians')
  async refreshPoliticians() {
    const rows = await this.svc.refreshTopPoliticians(100);
    return { ok: true, count: rows.length };
  }
}
