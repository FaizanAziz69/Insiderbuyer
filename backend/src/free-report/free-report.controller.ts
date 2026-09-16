import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { FreeReportService } from './free-report.service';

/** The free investor report. The PDF is public: it is the lead magnet the
 *  opt-in delivers, and the email link must open without a cookie. */
@Controller('free-report')
export class FreeReportController {
  constructor(private readonly svc: FreeReportService) {}

  @Get('pdf')
  async pdf(@Query('download') download: string | undefined, @Res() res: Response) {
    const buf = await this.svc.pdf();
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Length': String(buf.length),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="InsiderBuying-Get-On-The-Inside.pdf"`,
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
      })
      .send(buf);
  }

  @Get('status')
  status() {
    return this.svc.status();
  }

  /** Re-render now (after a copy change or to refresh the charts). */
  @Get('admin/rebuild')
  @UseGuards(AdminTokenGuard)
  async rebuild() {
    const buf = await this.svc.pdf(true);
    return { ok: true, bytes: buf.length };
  }
}
