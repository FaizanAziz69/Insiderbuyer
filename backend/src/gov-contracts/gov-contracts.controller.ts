import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { GovContractsService } from './gov-contracts.service';
import { ContractorDiscoveryService } from './contractor-discovery.service';

@Controller('gov-contracts')
export class GovContractsController {
  constructor(
    private readonly svc: GovContractsService,
    private readonly discovery: ContractorDiscoveryService,
  ) {}

  /**
   * Discover which of OUR tickers hold federal contracts, from USAspending's
   * own ranked recipient list, instead of the 41 names typed into
   * `gov-contracts-map.ts`. Defaults to a DRY RUN: pass `{ dryRun: false }`
   * only after reading the sample and the collisions it reports.
   */
  @Post('admin/discover')
  @UseGuards(AdminTokenGuard)
  async discover(@Body() body?: { pages?: number; limit?: number; dryRun?: boolean }) {
    return this.discovery.discover({
      pages: body?.pages,
      limit: body?.limit,
      dryRun: body?.dryRun !== false,
    });
  }

  /** Ranked list of large public federal contractors with TTM contract $ +
   *  live analyst ratings and upside. */
  @Get()
  async list(@Query('window') window?: string) {
    return { rows: await this.svc.getList(window ? Number(window) : undefined) };
  }

  /** Slice refresh from USAspending.gov — cloud cron calls this in a loop
   *  (unguarded like the other refresh endpoints; it writes only cache rows). */
  @Post('refresh')
  async refresh(@Body() body: { limit?: number; after?: string }) {
    return this.svc.refreshSlice({ limit: body?.limit, after: body?.after });
  }
}
