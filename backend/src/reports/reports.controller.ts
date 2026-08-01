import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

/** Opt-ins from the standalone Insider Quality Score landing page. */
@Controller('report-requests')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

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
  ) {
    return this.reports.createLead(body);
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
