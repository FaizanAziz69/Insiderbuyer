import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { PromoterService } from './promoter.service';
import { ContractPerformanceService } from './contract-performance.service';
import { PromoterEmailsService, PromoterEmailKind } from './promoter-emails.service';
import { DEFAULT_WEIGHTS, WEIGHT_LABELS } from './scoring';

/**
 * Promoter Score API — Developer Project Brief v2, Workstream F §2.5.
 *
 * Public reads are cacheable and identical for every visitor. The full
 * agreement table is NOT public: §2.5 calls it "the sellable feed" and says to
 * "gate behind a separate B2B account tier, not the retail subscription", so
 * it sits behind its own `PROMOTER_B2B_TOKEN` data-feed key (the admin token
 * also opens it). A proper B2B account tier replaces the shared key when there
 * is one to hang it on; until then the gate is real rather than notional.
 */
@Controller('promoter')
export class PromoterController {
  constructor(
    private readonly svc: PromoterService,
    private readonly perf: ContractPerformanceService,
    private readonly emails: PromoterEmailsService,
  ) {}

  // ── Promoter Score email list (George 2026-09-16) ──────────────────────

  /** Join the dedicated list; sends the welcome email once. */
  @Post('emails/subscribe')
  async emailSubscribe(@Body() body: { email?: string; source?: string }) {
    const out = await this.emails.subscribe(body?.email || '', body?.source);
    if (!out.ok) throw new BadRequestException('A valid email address is required.');
    return out;
  }

  /** One-click unsubscribe from the footer link / List-Unsubscribe header. */
  @Get('emails/unsubscribe')
  async emailUnsubscribe(@Query('token') token: string, @Res() res: Response) {
    const ok = await this.emails.unsubscribe(token || '');
    res
      .status(ok ? 200 : 404)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Promoter Score list</title>` +
          `<div style="max-width:520px;margin:60px auto;padding:0 20px;font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;">` +
          `<div style="font-size:26px;font-weight:900;letter-spacing:1px;">PROMOTER SCORE</div>` +
          `<div style="border-bottom:3px solid #1a237e;margin:6px 0 22px;"></div>` +
          (ok
            ? `<p>You’re unsubscribed from the Promoter Score list. You won’t receive the monthly issue again.</p>`
            : `<p>That unsubscribe link isn’t valid or has already been used.</p>`) +
          `<p><a href="https://insiderbuying.com/promoter-score" style="color:#1a237e;font-weight:700;">Back to Promoter Score →</a></p></div>`,
      );
  }

  @Get('emails/status')
  @UseGuards(AdminTokenGuard)
  emailStatus() {
    return this.emails.status();
  }

  /** Render a template for review: ?kind=welcome|monthly. */
  @Get('emails/preview')
  @UseGuards(AdminTokenGuard)
  async emailPreview(@Query('kind') kind: string, @Res() res: Response) {
    const k: PromoterEmailKind = kind === 'monthly' ? 'monthly' : 'welcome';
    const out = await this.emails.preview(k);
    res.type('html').send(`<!-- subject: ${out.subject.replace(/--/g, '—')} -->\n${out.html}`);
  }

  /** Send one template to one address for review. */
  @Post('emails/test-send')
  @UseGuards(AdminTokenGuard)
  async emailTestSend(@Body() body: { kind?: string; to?: string }) {
    const k: PromoterEmailKind = body?.kind === 'monthly' ? 'monthly' : 'welcome';
    return this.emails.testSend(k, body?.to || '');
  }

  /** Send the monthly issue to the whole list now. */
  @Post('emails/send-monthly')
  @UseGuards(AdminTokenGuard)
  async emailSendMonthly() {
    return this.emails.sendMonthly();
  }

  /** §2.5 ranking page: most-promoted stocks. */
  @Get('ranking')
  @Header('Cache-Control', 'public, max-age=300')
  async ranking(
    @Query('quarter') quarter?: string,
    @Query('sector') sector?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.ranking({ quarter, sector, sort, limit: Number(limit) || undefined });
  }

  /** §2.5 per-issuer module on the stock report page. */
  @Get('issuer/:ticker')
  @Header('Cache-Control', 'public, max-age=300')
  async issuer(@Param('ticker') ticker: string) {
    const out = await this.svc.issuer(ticker);
    if (!out) throw new NotFoundException('No disclosed IR agreements for this issuer.');
    return out;
  }

  /** The methodology block, read from the live weights so the published
   *  explanation cannot drift from the arithmetic. */
  @Get('methodology')
  @Header('Cache-Control', 'public, max-age=600')
  async methodology() {
    const weights = await this.svc.getWeights();
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return {
      weights,
      labels: WEIGHT_LABELS,
      defaults: DEFAULT_WEIGHTS,
      shares: Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10]),
      ),
      scope: {
        exchanges: ['TSXV', 'CSE'],
        why:
          'TSXV Policy 3.4 and the CSE equivalent require issuers to disclose investor relations, promotional and market-making agreements by news release — provider, compensation, term and any options granted. US issuers do not disclose IR spend as a line item, so there is nothing to compute.',
      },
      source: 'Issuer news releases disclosed under TSXV Policy 3.4 and CSE policy.',
    };
  }

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /** Refresh target for the in-process / GitHub schedulers. Returns as soon
   *  as the run starts — a full pass takes minutes (see startIngest). */
  @Get('cron')
  @UseGuards(AdminTokenGuard)
  async cron() {
    return this.svc.startIngest();
  }

  // ── B2B feed (§2.5) ────────────────────────────────────────────────────

  /** Top IR Promoters — firms ranked by client stock performance and volume
   *  growth after engagement. Paygated on the page; the API is open like the
   *  other presentational gates here. */
  @Get('top-promoters')
  @Header('Cache-Control', 'public, max-age=300')
  async topPromoters(@Query('minCampaigns') minCampaigns?: string, @Query('limit') limit?: string) {
    return this.svc.topPromoters({
      minCampaigns: Number(minCampaigns) || undefined,
      limit: Number(limit) || undefined,
    });
  }

  @Get('firms')
  async firms(
    @Headers('x-feed-token') token: string,
    @Headers('x-admin-token') adminToken: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertFeed(token, adminToken);
    return this.svc.firms({ search, limit: Number(limit) || undefined });
  }

  @Get('export.csv')
  async exportCsv(
    @Headers('x-feed-token') token: string,
    @Headers('x-admin-token') adminToken: string,
    @Res() res: Response,
    @Query('limit') limit?: string,
  ) {
    this.assertFeed(token, adminToken);
    const rows = await this.svc.exportRows(Number(limit) || 5000);
    const cols = [
      'ticker', 'exchange', 'issuer_name', 'provider_name', 'provider_slug', 'kind', 'status',
      'start_date', 'end_date', 'term_months', 'currency', 'monthly_fee', 'total_value',
      'monthly_fee_cad', 'total_value_cad', 'options_granted', 'option_strike', 'arms_length',
      'confidence', 'reviewed_at', 'published_at', 'source_url',
    ];
    const csv = [cols.join(',')]
      .concat(rows.map((r: any) => cols.map((c) => csvCell(r[c])).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="insiderbuying-ir-agreements.csv"');
    res.send(csv);
  }

  private assertFeed(token?: string, adminToken?: string) {
    const feed = process.env.PROMOTER_B2B_TOKEN || '';
    const admin = process.env.ADMIN_API_TOKEN || '';
    if (admin && adminToken === admin) return;
    if (feed && token === feed) return;
    throw new ForbiddenException(
      'The IR agreement feed is a B2B data product. Contact devs@insiderbuying.com for a feed token.',
    );
  }

  // ── Admin (§2.5 manual-review queue + audit trail) ─────────────────────

  @Get('admin/review')
  @UseGuards(AdminTokenGuard)
  async review(@Query('limit') limit?: string) {
    return this.svc.reviewQueue(Number(limit) || undefined);
  }

  @Post('admin/review/:id')
  @UseGuards(AdminTokenGuard)
  async correct(
    @Param('id') id: string,
    @Body() body: { actor?: string; reason?: string; [k: string]: any },
  ) {
    const { actor, reason, ...patch } = body || {};
    const out = await this.svc.correct(Number(id), patch, actor || 'admin', reason);
    if (!out) throw new NotFoundException('No such agreement.');
    return out;
  }

  @Get('admin/audit')
  @UseGuards(AdminTokenGuard)
  async audit(@Query('agreementId') agreementId?: string, @Query('limit') limit?: string) {
    return this.svc.audit(agreementId ? Number(agreementId) : undefined, Number(limit) || undefined);
  }

  @Put('admin/weights')
  @UseGuards(AdminTokenGuard)
  async weights(@Body() body: Record<string, any>) {
    const { actor, ...rest } = body || {};
    return this.svc.setWeights(rest, actor || 'admin');
  }

  /** Starts a run and returns immediately; poll `/promoter/status` for the
   *  counts. Pass `wait=1` for a short run you want the result of inline. */
  @Post('admin/ingest')
  @UseGuards(AdminTokenGuard)
  async ingest(@Query('limit') limit?: string, @Query('wait') wait?: string) {
    const n = Number(limit) || undefined;
    if (wait === '1') return this.svc.ingest(n);
    return this.svc.startIngest(n);
  }

  /** Re-read every stored release with the current parser. No wire is
   *  touched; hand-reviewed rows are preserved. */
  @Post('admin/reparse')
  @UseGuards(AdminTokenGuard)
  async reparse(@Query('limit') limit?: string) {
    return this.svc.reparse(Number(limit) || undefined);
  }

  /** Recompute what the share price did after each contract began. */
  @Post('admin/refresh-performance')
  @UseGuards(AdminTokenGuard)
  async refreshPerformance(@Query('limit') limit?: string) {
    return this.perf.refresh(Number(limit) || undefined);
  }

  @Post('admin/rescore')
  @UseGuards(AdminTokenGuard)
  async rescore(@Query('quarters') quarters?: string) {
    return { written: await this.svc.rescore(Number(quarters) || undefined) };
  }

  @Post('admin/resolve-issuers')
  @UseGuards(AdminTokenGuard)
  async resolveIssuers(@Query('max') max?: string) {
    return { resolved: await this.svc.resolveIssuers(Number(max) || undefined) };
  }
}

function csvCell(v: any): string {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
