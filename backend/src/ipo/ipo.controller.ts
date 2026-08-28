import { Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { IpoService } from './ipo.service';

/**
 * IPO Calendar API — Developer Project Brief (Aug 24 2026), Workstream E.
 * Public reads are identical for every visitor and cacheable; the refresh
 * trigger sits behind the admin token.
 */
@Controller('ipo')
export class IpoController {
  constructor(private readonly svc: IpoService) {}

  /** §7.1 trailing-90-day table. sort=date (default) | return; dir=desc|asc. */
  @Get('recent')
  @Header('Cache-Control', 'public, max-age=300')
  async recent(@Query('sort') sort?: string, @Query('dir') dir?: string) {
    return this.svc.recent(sort === 'return' ? 'return' : 'date', dir === 'asc' ? 'asc' : 'desc');
  }

  /** Secondary tab: upcoming / expected listings. */
  @Get('upcoming')
  @Header('Cache-Control', 'public, max-age=300')
  async upcoming() {
    return this.svc.upcoming();
  }

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /** Refresh target for the in-process / GitHub schedulers. */
  @Get('cron')
  async cron() {
    return this.svc.refreshIfStale();
  }

  /** Legacy shape — kept so nothing that still reads it breaks. */
  @Get('calendar')
  @Header('Cache-Control', 'public, max-age=300')
  async calendar() {
    return { rows: await this.svc.getCalendar() };
  }

  @Post('admin/refresh')
  @UseGuards(AdminTokenGuard)
  async refresh() {
    return this.svc.refresh();
  }
}
