import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { DataAccessService } from './data-access.service';

/**
 * Request-Access gate for the B2B promoter datasets (George 2026-09-21).
 * These are not sold through the retail subscription, so nothing here checks
 * `premium` — access comes from a reviewed request and a minted token.
 */
@Controller('data-access')
export class DataAccessController {
  constructor(private readonly svc: DataAccessService) {}

  @Post('request')
  async request(
    @Body() body: { dataset?: string; name?: string; title?: string; company?: string; companyEmail?: string },
  ) {
    return this.svc.submit(body);
  }

  /** Does this browser's token open this dataset? */
  @Get('verify')
  async verify(@Query('token') token?: string, @Query('dataset') dataset?: string) {
    return this.svc.verify(token || '', dataset || 'both');
  }

  @UseGuards(AdminTokenGuard)
  @Get('admin/list')
  async list(@Query('status') status?: string) {
    return { rows: await this.svc.list(status) };
  }

  @UseGuards(AdminTokenGuard)
  @Post('admin/:id/approve')
  async approve(@Param('id') id: string, @Body() body?: { note?: string }) {
    return this.svc.decide(id, true, body?.note);
  }

  @UseGuards(AdminTokenGuard)
  @Post('admin/:id/decline')
  async decline(@Param('id') id: string, @Body() body?: { note?: string }) {
    return this.svc.decide(id, false, body?.note);
  }
}
