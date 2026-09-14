import {
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
  ) {}

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
