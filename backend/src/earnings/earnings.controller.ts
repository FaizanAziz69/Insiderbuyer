import { Controller, Get, Query } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { EARNINGS_INSIDER_WINDOW_DAYS, EarningsSignalsService } from './earnings-signals.service';

@Controller('earnings')
export class EarningsController {
  constructor(
    private readonly svc: EarningsService,
    private readonly signals: EarningsSignalsService,
  ) {}

  /** Analyst target / upside and trailing-quarter insider $ flows for every
   *  symbol on the `days`-day calendar, keyed by symbol. Separate from
   *  /calendar so the calendar itself stays as fast as it is. */
  @Get('signals')
  async signalsFor(@Query('days') days?: string) {
    const d = Math.min(14, Math.max(1, Number(days) || 7));
    const rows = await this.signals.forCalendar(d);
    return { rows, insiderWindowDays: EARNINGS_INSIDER_WINDOW_DAYS };
  }

  @Get('calendar')
  async calendar(@Query('days') days?: string) {
    const rows = await this.svc.getCalendar(days ? Number(days) : 7);
    return { rows };
  }

  /** Warm the calendar cache so a real visitor never pays for the rebuild.
   *  Point a cron at this; a no-op once the cache is warm. Note the cache is
   *  per-instance, so this only helps requests that land on the same one. */
  @Get('prewarm')
  async prewarm() {
    const rows = await this.svc.getCalendar(14);
    return { ok: true, rows: rows.length };
  }
}
