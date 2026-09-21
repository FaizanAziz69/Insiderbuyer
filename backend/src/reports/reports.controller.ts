import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import { User } from '../entities/user.entity';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

/** Opt-ins from the standalone Insider Quality Score landing page. */
@Controller('report-requests')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** A signed-in Insider Access member is exempt from the 3-report cap. */
  private async isPremium(authHeader?: string): Promise<boolean> {
    const m = (authHeader || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return false;
    const payload = this.auth.verifyToken(m[1].trim());
    if (!payload) return false;
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) return false;
    try {
      return !!(await this.billing.status(user)).premium;
    } catch {
      return false;
    }
  }

  @Post()
  async create(
    @Body()
    body: {
      ticker?: string;
      contact?: string;
      channel?: string;
      companyName?: string;
      source?: string;
    },
    @Headers('authorization') authHeader?: string,
  ) {
    const premium = await this.isPremium(authHeader);
    const out = await this.reports.createLead(body, { premium });
    const email = (body?.contact || '').trim().toLowerCase();
    const used = premium ? 0 : await this.reports.freeReportsUsed(email);
    return {
      ...out,
      used,
      limit: ReportsService.FREE_REPORTS,
      remaining: premium ? null : Math.max(0, ReportsService.FREE_REPORTS - used),
    };
  }

  /** How many free reports an email has left (the landing page shows it). */
  @Get('remaining')
  async remaining(@Query('email') email: string | undefined, @Headers('authorization') authHeader?: string) {
    const e = (email || '').trim().toLowerCase();
    if (!e) return { used: 0, limit: ReportsService.FREE_REPORTS, remaining: ReportsService.FREE_REPORTS };
    if (await this.isPremium(authHeader)) return { used: 0, limit: ReportsService.FREE_REPORTS, remaining: null };
    const used = await this.reports.freeReportsUsed(e);
    return { used, limit: ReportsService.FREE_REPORTS, remaining: Math.max(0, ReportsService.FREE_REPORTS - used) };
  }

  /** Browser preview of the standard report template for any ticker. */
  @Get('preview/:ticker')
  async previewTicker(@Param('ticker') ticker: string, @Res() res: Response) {
    const html = await this.reports.renderForTicker(ticker);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** The exact report a stored lead will receive once delivery is wired. */
  @Get(':id/preview')
  async previewLead(@Param('id') id: string, @Res() res: Response) {
    const html = await this.reports.renderForLead(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
