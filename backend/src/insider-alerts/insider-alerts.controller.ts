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

  /** Turn email delivery on or off immediately. `?on=1` or `?on=0`. */
  @Post('sending')
  @UseGuards(AdminTokenGuard)
  setSending(@Query('on') on?: string) {
    return this.svc.setSending(on === '1' || on === 'true');
  }

  /** Run the premium watchlist sweep now. `?dry=1` counts without sending. */
  @Post('run-watchlists')
  @UseGuards(AdminTokenGuard)
  runWatchlists(@Query('dry') dry?: string) {
    return this.svc.runWatchlists(dry === '1' || dry === 'true');
  }
}
