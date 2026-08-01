import { Controller, Get } from '@nestjs/common';
import { LandingService } from './landing.service';

/** Real data for the /insider-report landing page panels. */
@Controller('landing')
export class LandingController {
  constructor(private readonly landing: LandingService) {}

  @Get('insider-panels')
  async panels() {
    return this.landing.getPanels();
  }
}
