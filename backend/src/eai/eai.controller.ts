import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { EaiService } from './eai.service';

@Controller('eai')
export class EaiController {
  constructor(private readonly svc: EaiService) {}

  /** Cached EAI scores. `?symbols=AAPL,MSFT` narrows it; empty = everything. */
  @Get()
  async map(@Query('symbols') symbols?: string) {
    const list = (symbols || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { rows: await this.svc.getMap(list.length ? list : undefined) };
  }

  @Get('status')
  status() {
    return this.svc.status();
  }

  /** Recompute for everything reporting in the next `days` days. */
  @Post('refresh')
  @UseGuards(AdminTokenGuard)
  refresh(@Query('days') days?: string) {
    return this.svc.refresh(Math.min(30, Math.max(1, Number(days) || 14)));
  }
}
