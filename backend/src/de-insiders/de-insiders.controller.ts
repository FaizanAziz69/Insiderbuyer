import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { DeInsidersService } from './de-insiders.service';

/** German insider transactions (BaFin Directors' Dealings) — status, a
 *  recent-rows peek, the scheduler hook, and an admin backfill. */
@Controller('de-insiders')
export class DeInsidersController {
  constructor(private readonly svc: DeInsidersService) {}

  @Get('status')
  async status() {
    return this.svc.status();
  }

  @Get('recent')
  async recent(@Query('limit') limit?: string) {
    const n = Number(limit);
    return { rows: await this.svc.recent(Number.isFinite(n) && n > 0 ? n : 50) };
  }

  /** Scheduler hook: 30-day window, idempotent. */
  @Get('cron')
  async cron() {
    return this.svc.ingest(2);
  }

  /** zeitraum=3 re-reads BaFin's whole 12-month database. */
  @Post('admin/ingest')
  @UseGuards(AdminTokenGuard)
  async ingest(@Query('zeitraum') z?: string) {
    const zz = z === '1' ? 1 : z === '3' ? 3 : 2;
    return this.svc.ingest(zz);
  }
}
