import { BadRequestException, Body, Controller, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { ProductUpdatesService } from './product-updates.service';

/**
 * Product Updates list — public join/leave, admin preview/test/send.
 * Everything under admin/ needs the x-admin-token header.
 */
@Controller('product-updates')
export class ProductUpdatesController {
  constructor(private readonly svc: ProductUpdatesService) {}

  /** Join the list; sends the welcome email once. */
  @Post('subscribe')
  async subscribe(@Body() body: { email?: string; source?: string }) {
    const out = await this.svc.subscribe(body?.email || '', body?.source);
    if (!out.ok) throw new BadRequestException('A valid email address is required.');
    return out;
  }

  /** One-click unsubscribe from the footer link / List-Unsubscribe header. */
  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    const ok = await this.svc.unsubscribe(token || '');
    res
      .status(ok ? 200 : 404)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Product Updates</title>` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<div style="max-width:560px;margin:60px auto;padding:0 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111;">` +
          `<div style="font-size:26px;font-weight:900;letter-spacing:1px;">PRODUCT UPDATES</div>` +
          `<div style="border-bottom:3px solid #1a237e;margin:6px 0 22px;"></div>` +
          (ok
            ? `<p><strong>You’re unsubscribed.</strong> You won’t receive any more Product Updates emails. If this was a mistake, you can rejoin from any product page.</p>`
            : `<p>That unsubscribe link isn’t valid or has already been used.</p>`) +
          `<p><a href="/" style="color:#1a237e;font-weight:700;">Back to InsiderBuying.com</a></p></div>`,
      );
  }

  /** The sequence and its timing — public, no personal data. */
  @Get('schedule')
  @Header('Cache-Control', 'public, max-age=600')
  schedule() {
    return { steps: this.svc.steps() };
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  @Get('admin/status')
  @UseGuards(AdminTokenGuard)
  status() {
    return this.svc.status();
  }

  /** Render one email as HTML: ?step=welcome | f01-insider-score | … */
  @Get('admin/preview')
  @UseGuards(AdminTokenGuard)
  preview(@Query('step') step: string, @Res() res: Response) {
    try {
      const { html } = this.svc.preview(step || 'welcome');
      res.type('html').send(html);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'unknown step');
    }
  }

  /** Send one email (or the whole sequence with step=all) to one address for review. */
  @Post('admin/test-send')
  @UseGuards(AdminTokenGuard)
  async testSend(@Body() body: { step?: string; to?: string }) {
    if (!body?.to) throw new BadRequestException('"to" is required');
    if (body.step === 'all') return this.svc.testSendAll(body.to);
    return this.svc.testSend(body.step || 'welcome', body.to);
  }

  /** Run the drip now, ignoring the daytime window (the cron does this every 15 min). */
  @Post('admin/send-due')
  @UseGuards(AdminTokenGuard)
  sendDue() {
    return this.svc.processDue({ ignoreWindow: true });
  }

  /** Bulk-enrol a pasted list of addresses. Each gets the welcome and starts its own clock. */
  @Post('admin/enroll')
  @UseGuards(AdminTokenGuard)
  async enroll(@Body() body: { emails?: string[]; source?: string }) {
    if (!Array.isArray(body?.emails) || !body.emails.length) throw new BadRequestException('"emails" array required');
    return this.svc.enroll(body.emails, body.source || 'admin-enroll');
  }
}
