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

  // ── Deciding from the email (no admin token; the link is signed) ──
  //
  // These are NOT guarded by AdminTokenGuard on purpose: the whole point is
  // that George can act from his inbox without holding the admin secret. The
  // HMAC in the link is the credential, and it is scoped to one request and
  // one action. See the signing block in the service.

  /** Read-only. Mail scanners hit this and must not change anything. */
  @Get('review')
  async review(
    @Query('id') id?: string,
    @Query('action') action?: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    return this.svc.reviewByLink(
      id || '',
      action === 'decline' ? 'decline' : 'approve',
      exp || '',
      sig || '',
    );
  }

  /** The decision. A POST, so no link preview can trigger it. */
  @Post('review')
  async reviewDecide(
    @Body() body: { id?: string; action?: string; exp?: string; sig?: string; note?: string },
  ) {
    return this.svc.decideByLink(
      body?.id || '',
      body?.action === 'decline' ? 'decline' : 'approve',
      body?.exp || '',
      body?.sig || '',
      body?.note,
    );
  }

  /** Every request, for the "see every access request" link. */
  @Get('queue')
  async queue(@Query('exp') exp?: string, @Query('sig') sig?: string) {
    return this.svc.queueByLink(exp || '', sig || '');
  }

  @UseGuards(AdminTokenGuard)
  @Get('admin/list')
  async list(@Query('status') status?: string) {
    return { rows: await this.svc.list(status) };
  }

  /** Re-send the desk notification (with its Approve/Decline buttons) for a
   *  request that is already on file. */
  @UseGuards(AdminTokenGuard)
  @Post('admin/:id/notify')
  async notify(@Param('id') id: string) {
    return this.svc.resendNotification(id);
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
