import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { PitSnapshotsService } from './pit-snapshots.service';

/**
 * Point-in-time input snapshots — the as-of dimension Brief v9 §5 needs to
 * calibrate C3/C4/C5/C6.
 *
 *  GET  /api/pit-snapshots/status          rows, dates and span, per kind
 *  POST /api/pit-snapshots/admin/snapshot  take today's snapshot now  {asOf?}
 *
 * Both are guarded. The snapshot route is a write, and `status` reports the
 * shape of an internal calibration store that nothing public consumes.
 */
@Controller('pit-snapshots')
@UseGuards(AdminTokenGuard)
export class PitSnapshotsController {
  constructor(private readonly svc: PitSnapshotsService) {}

  @Get('status')
  async status() {
    return this.svc.status();
  }

  /**
   * `asOf` may only ever be today. It is accepted so a caller can pin the date
   * across a midnight boundary, not so the store can be backfilled — a past
   * date is refused with a 400 explaining why, because dating today's roster,
   * contract totals and grades to an earlier day is the exact lookahead this
   * store exists to prevent.
   */
  @Post('admin/snapshot')
  async snapshot(@Body() body: { asOf?: string } = {}) {
    return this.svc.takeSnapshot(body?.asOf);
  }
}
