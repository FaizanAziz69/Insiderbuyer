import { Controller, Get, Query } from '@nestjs/common';
import { EarningsService } from './earnings.service';

@Controller('earnings')
export class EarningsController {
  constructor(private readonly svc: EarningsService) {}

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
