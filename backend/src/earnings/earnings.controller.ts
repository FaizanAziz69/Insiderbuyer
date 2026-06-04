import { Controller, Get, Query } from '@nestjs/common';
import { EarningsService } from './earnings.service';

@Controller('earnings')
export class EarningsController {
  constructor(private readonly svc: EarningsService) {}

  @Get('calendar')
  async calendar(@Query('days') days?: string) {
    const rows = await this.svc.getCalendar(days ? Number(days) : 7);
    return { rows };
  }
}
