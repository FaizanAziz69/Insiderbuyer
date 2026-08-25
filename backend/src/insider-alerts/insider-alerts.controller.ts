import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { InsiderAlertsService } from './insider-alerts.service';

@Controller('insider-alerts')
export class InsiderAlertsController {
  constructor(private readonly svc: InsiderAlertsService) {}

  @Get('status')
  status() {
    return this.svc.status();
  }

  /** Run the sweep now. `?dry=1` renders the digest without sending. */
  @Post('run')
  @UseGuards(AdminTokenGuard)
  run(@Query('dry') dry?: string) {
    return this.svc.run(dry === '1' || dry === 'true');
  }
}
