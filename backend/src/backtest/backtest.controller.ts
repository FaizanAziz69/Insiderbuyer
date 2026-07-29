import { Controller, Get } from '@nestjs/common';
import { BacktestService } from './backtest.service';

@Controller('backtest')
export class BacktestController {
  constructor(private readonly svc: BacktestService) {}

  /** Insider-buying strategy backtest computed from our own Form 4 history. */
  @Get('insider-strategy')
  async insiderStrategy() {
    return this.svc.get();
  }
}
