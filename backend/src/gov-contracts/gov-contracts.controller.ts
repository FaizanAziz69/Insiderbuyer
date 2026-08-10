import { Body, Controller, Get, Post } from '@nestjs/common';
import { GovContractsService } from './gov-contracts.service';

@Controller('gov-contracts')
export class GovContractsController {
  constructor(private readonly svc: GovContractsService) {}

  /** Ranked list of large public federal contractors with TTM contract $ +
   *  live analyst ratings and upside. */
  @Get()
  async list() {
    return { rows: await this.svc.getList() };
  }

  /** Slice refresh from USAspending.gov — cloud cron calls this in a loop
   *  (unguarded like the other refresh endpoints; it writes only cache rows). */
  @Post('refresh')
  async refresh(@Body() body: { limit?: number; after?: string }) {
    return this.svc.refreshSlice({ limit: body?.limit, after: body?.after });
  }
}
