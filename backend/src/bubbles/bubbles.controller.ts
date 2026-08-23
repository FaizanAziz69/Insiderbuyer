import { Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { BubblesService } from './bubbles.service';

@Controller('bubbles')
export class BubblesController {
  constructor(private readonly svc: BubblesService) {}

  /** The map's one read: the pre-composed bubble set for a window. Public and
   *  cacheable — the payload is identical for every anonymous visitor, so the
   *  nginx micro-cache / CDN can absorb the traffic spikes a shareable
   *  front-door page invites. */
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async read(@Query('window') window?: string) {
    return this.svc.read(window);
  }

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /** Refresh target for the GitHub workflow (plain GET, so it cannot be
   *  token-guarded) — the staleness window is what stops a public URL from
   *  triggering rebuild work on every hit, same as pe-cron. */
  @Get('cron')
  async cron() {
    return this.svc.refreshIfStale();
  }

  /** Forced rebuild. Guarded: it fans out per-symbol FMP enrichment. */
  @Post('refresh')
  @UseGuards(AdminTokenGuard)
  async refresh() {
    const result = await this.svc.refresh();
    return { ...result, status: await this.svc.status() };
  }
}
