import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { InvestorsService, InvestorTab, TABS } from './investors.service';

/**
 * Top Insiders API — Developer Project Brief (Aug 24 2026), Workstream B.
 *
 * Public reads are cacheable (identical for every visitor). Everything that
 * changes the roster or triggers 13F ingestion sits behind the admin token,
 * because the brief wants the roster editable "without a deploy" — by the
 * admin, not by the internet.
 */
@Controller('investors')
export class InvestorsController {
  constructor(private readonly svc: InvestorsService) {}

  /** §4.1 card grid for one tab. */
  @Get()
  @Header('Cache-Control', 'public, max-age=120')
  async list(@Query('tab') tab?: string) {
    const t = (TABS as readonly string[]).includes(String(tab)) ? (tab as InvestorTab) : 'popular';
    return this.svc.list(t);
  }

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /** Refresh target for the in-process / GitHub schedulers. */
  @Get('cron')
  async cron() {
    return this.svc.refreshIfStale();
  }

  /** §4.3 investor detail page. */
  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=120')
  async detail(@Param('slug') slug: string, @Query('all') all?: string) {
    const d = await this.svc.detail(slug, all === '1');
    if (!d) throw new NotFoundException('Unknown investor');
    return d;
  }

  /* ---------------------------------------------------------- admin */

  /** Full roster incl. inactive rows and raw fields — the admin's editor. */
  @Get('admin/roster')
  @UseGuards(AdminTokenGuard)
  async roster() {
    return { rows: await this.svc.rosterRows() };
  }

  /** Add or edit an investor (categories, CIK, names, active flag, note). */
  @Put('admin/roster/:slug')
  @UseGuards(AdminTokenGuard)
  async upsert(
    @Param('slug') slug: string,
    @Body()
    body: {
      person?: string;
      firm?: string;
      cik?: string | null;
      categories?: string[];
      active?: boolean;
      note?: string | null;
      sort?: number;
    },
  ) {
    return { row: await this.svc.upsertInvestor(slug, body || {}) };
  }

  @Delete('admin/roster/:slug')
  @UseGuards(AdminTokenGuard)
  async remove(@Param('slug') slug: string) {
    return { removed: await this.svc.removeInvestor(slug) };
  }

  /** Force a 13F ingest + performance recompute (all, or one slug). */
  @Post('admin/refresh')
  @UseGuards(AdminTokenGuard)
  async refresh(@Query('slug') slug?: string) {
    return this.svc.refresh(slug || undefined);
  }
}
