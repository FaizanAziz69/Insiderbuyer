import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { PremiumAccessService, stripPremiumFields } from '../common/premium-access';
import { StrategiesService } from './strategies.service';
import { StrategyDataService } from './strategy-data.service';
import { StrategyAlertsService } from './strategy-alerts.service';

/**
 * §5.3 gating, in one place:
 *   Free    — index, cards, charts, rules, metrics
 *   Premium — holdings, rebalance logs, CSV export
 *
 * Fields are DELETED for a guest rather than blanked, so nothing downstream can
 * read a mask as a real value — the same rule the CQS board follows.
 */
const STRATEGY_PREMIUM_FIELDS = ['holdings', 'rebalanceLog'] as const;

@Controller('strategies')
export class StrategiesController {
  constructor(
    private readonly svc: StrategiesService,
    private readonly data: StrategyDataService,
    private readonly alerts: StrategyAlertsService,
    private readonly access: PremiumAccessService,
  ) {}

  /** §5.1 — the index, free. */
  @Get()
  async index() {
    return this.svc.index();
  }

  /** §5.2 — one strategy. Holdings and the rebalance log are Premium. */
  @Get(':slug')
  async detail(@Param('slug') slug: string, @Headers('authorization') auth?: string) {
    const row = await this.svc.detail(slug);
    if (!row) return { error: 'not_found' };
    const entitled = await this.access.isPremium(auth);
    const [shaped] = stripPremiumFields([row] as any[], STRATEGY_PREMIUM_FIELDS as any, entitled);
    return { ...shaped, premium: entitled };
  }

  /**
   * §5.3's CSV export — Premium. Holdings only: the rebalance log is a
   * different document and a reader asking for "the portfolio" means this one.
   */
  @Get(':slug/holdings.csv')
  async holdingsCsv(@Param('slug') slug: string, @Headers('authorization') auth?: string) {
    if (!(await this.access.isPremium(auth))) return { error: 'premium_required' };
    const row = await this.svc.detail(slug);
    if (!row) return { error: 'not_found' };
    const lines = ['ticker,weight,entry_date,trigger'];
    for (const h of row.holdings || []) {
      lines.push(`${h.ticker},${(h.weight ?? 0).toFixed(6)},${h.entryDate},"${String(h.trigger || '').replace(/"/g, '""')}"`);
    }
    return { filename: `${slug}-holdings.csv`, csv: lines.join('\n') };
  }

  @Post('admin/run')
  @UseGuards(AdminTokenGuard)
  async run(@Body() body: { slug?: string; from?: string; to?: string } = {}) {
    if (body.slug) {
      const r = await this.svc.runOne(body.slug, body);
      return r ? { ok: true, slug: body.slug, rebalances: r.rebalances, metrics: r.metrics } : { error: 'not_found' };
    }
    return this.svc.runAll(body);
  }

  /** §5.3's rebalance alerts. `?send=0` previews without emailing anyone. */
  @Post('admin/alerts')
  @UseGuards(AdminTokenGuard)
  async runAlerts(@Query('send') send?: string) {
    return this.alerts.run({ send: send !== '0' });
  }

  /**
   * §7's launch set, so George can choose without a deploy.
   *
   *   POST /strategies/admin/live                 → publish the whole library
   *   POST /strategies/admin/live?slugs=a,b,c     → publish only those
   *
   * The brief suggests starting with 1, 3, 7, 8, 9 and 10:
   *   congress-buys, lobbying-surge, insider-buying-sp500,
   *   sp500-plus-insider-buying, ceo-conviction, insider-clusters-smid
   */
  @Post('admin/live')
  @UseGuards(AdminTokenGuard)
  async setLive(@Query('slugs') slugs?: string) {
    return this.svc.setLiveSlugs(slugs ?? '');
  }

  /**
   * §4.1's "[date]" and §7's open item: the paper-trading start date.
   *   POST /strategies/admin/paper-start?date=2026-11-01
   *   POST /strategies/admin/paper-start          (clears it)
   */
  @Post('admin/paper-start')
  @UseGuards(AdminTokenGuard)
  async setPaperStart(@Query('date') date?: string) {
    return this.svc.setPaperStartDate(date ?? '');
  }

  @Post('admin/refresh-data')
  @UseGuards(AdminTokenGuard)
  async refreshData(
    @Query('year') year?: string,
    @Query('period') period?: string,
    @Query('maxPages') maxPages?: string,
  ) {
    const sp500 = await this.data.refreshSp500();
    const comp = await this.data.refreshExecComp();
    const lobby = year && period
      ? await this.data.refreshLobbying(Number(year), period, { maxPages: Number(maxPages) || undefined })
      : null;
    return { sp500, comp, lobby };
  }
}
