import { Body, Controller, Get, Header, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { EditorialTokenGuard } from '../common/editorial-token.guard';
import { DataArticlesService } from './data-articles.service';

/**
 * Data Articles API — Developer Project Brief (Aug 24 2026), Workstream A.
 *
 *  GET /data-articles                    index (headline, dek, refresh cadence, updated)
 *  GET /data-articles/:slug              article shell: editable sections filled from live data
 *  GET /data-articles/:slug/chart?period one endpoint per article per period (§3.2 data contract)
 *  editorial (x-admin-token = ADMIN or EDITORIAL token): list / PUT sections / POST refresh
 *  — the only endpoints the editorial-scoped token opens.
 */
@Controller('data-articles')
export class DataArticlesController {
  constructor(private readonly svc: DataArticlesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async list() {
    return this.svc.list();
  }

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /** Refresh target for the in-process / GitHub schedulers. */
  @Get('cron')
  async cron() {
    await this.svc.refreshStale();
    return { ok: true };
  }

  @Get('admin/list')
  @UseGuards(EditorialTokenGuard)
  async adminList() {
    return this.svc.adminList();
  }

  @Put('admin/:slug')
  @UseGuards(EditorialTokenGuard)
  async adminUpdate(@Param('slug') slug: string, @Body() body: any) {
    const row = await this.svc.adminUpdate(slug, body || {});
    if (!row) throw new NotFoundException('Unknown article');
    return row;
  }

  @Post('admin/refresh')
  @UseGuards(EditorialTokenGuard)
  async refresh(@Query('kind') kind?: string) {
    if (kind === 'weekly' || kind === 'monthly' || kind === 'quarterly') return { rebuilt: await this.svc.refreshKind(kind) };
    return { rebuilt: await this.svc.refreshAll() };
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300')
  async article(@Param('slug') slug: string) {
    const a = await this.svc.article(slug);
    if (!a) throw new NotFoundException('Unknown article');
    return a;
  }

  @Get(':slug/chart')
  @Header('Cache-Control', 'public, max-age=300')
  async chart(@Param('slug') slug: string, @Query('period') period?: string) {
    const p = await this.svc.chart(slug, period);
    if (!p) throw new NotFoundException('Unknown article');
    return p;
  }
}
