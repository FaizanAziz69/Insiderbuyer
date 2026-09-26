import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { CqsCalibrationService } from './cqs-calibration.service';

/**
 * Brief v9 §5 calibration harness.
 *
 *  POST /cqs-calibration/admin/run       {from?,to?,limitWeeks?,after?} — one resumable slice
 *  GET  /cqs-calibration/status          coverage, cursor, recent runs
 *  POST /cqs-calibration/admin/evaluate  decile forward returns, training vs holdout
 *  POST /cqs-calibration/admin/ablate    each PIT component removed in turn
 *
 * Every route is admin-guarded, `status` included: the walk and its results are
 * a research artefact, not a public surface, and the numbers here are of a
 * REDUCED score (see the service header) that would be misread as the shipped
 * CQS if it were published.
 */
@Controller('cqs-calibration')
@UseGuards(AdminTokenGuard)
export class CqsCalibrationController {
  constructor(private readonly svc: CqsCalibrationService) {}

  @Post('admin/run')
  async run(
    @Body()
    body: {
      from?: string;
      to?: string;
      limitWeeks?: number;
      after?: string;
      label?: string;
    } = {},
  ) {
    return this.svc.run({
      from: body?.from,
      to: body?.to,
      limitWeeks: body?.limitWeeks == null ? undefined : Number(body.limitWeeks),
      after: body?.after,
      label: body?.label,
    });
  }

  @Get('status')
  async status() {
    return this.svc.status();
  }

  @Post('admin/evaluate')
  async evaluate(@Body() body: { minCrossSection?: number; buckets?: number } = {}) {
    return this.svc.evaluate({
      minCrossSection:
        body?.minCrossSection == null ? undefined : Number(body.minCrossSection),
      // Quintiles by default; pass 10 once the cross-section can carry them.
      buckets: body?.buckets == null ? undefined : Number(body.buckets),
    });
  }

  @Post('admin/ablate')
  async ablate(@Body() body: { months?: number; minCrossSection?: number; buckets?: number } = {}) {
    return this.svc.ablate({
      months: body?.months == null ? undefined : Number(body.months),
      minCrossSection:
        body?.minCrossSection == null ? undefined : Number(body.minCrossSection),
      buckets: body?.buckets == null ? undefined : Number(body.buckets),
    });
  }
}
