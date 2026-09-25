import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { LegislativeCalendarService } from './legislative-calendar.service';

/**
 * Committee schedules — the input to Brief v9 §3's Legislative Catalyst.
 *
 *  GET  /legislative-calendar/status            row counts + honest coverage
 *  GET  /legislative-calendar/committee?name=   upcoming activity, as evidence
 *  POST /legislative-calendar/admin/refresh     pull both chambers now
 */
@Controller('legislative-calendar')
export class LegislativeCalendarController {
  constructor(private readonly svc: LegislativeCalendarService) {}

  @Get('status')
  async status() {
    return this.svc.status();
  }

  @Get('committee')
  async committee(@Query('name') name: string, @Query('chamber') chamber?: string) {
    if (!name) return { error: 'name is required' };
    return { rows: await this.svc.forCommittee(name, chamber === 'House' ? 'House' : 'Senate') };
  }

  @Post('admin/refresh')
  @UseGuards(AdminTokenGuard)
  async refresh() {
    return this.svc.refresh();
  }
}
