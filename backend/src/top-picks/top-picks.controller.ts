import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TopPicksService } from './top-picks.service';

/**
 * The funnel's final downsell (Round-2 brief, Section 2 Step 5): a $3 one-off
 * report of stocks trading below the average price insiders paid.
 *
 * `preview` is public (the landing page needs a count, not the tickers);
 * `picks` is only reachable through `fulfil`, which requires a paid Stripe
 * session.
 */
@Controller('top-picks-report')
export class TopPicksController {
  constructor(private readonly svc: TopPicksService) {}

  /** Teaser numbers for the landing page — no tickers. */
  @Get('preview')
  async preview() {
    return this.svc.getPreview();
  }

  /** Guest checkout: email in, Stripe URL out. */
  @Post('checkout')
  async checkout(@Body() body: { email?: string }) {
    return this.svc.startCheckout(body?.email || '');
  }

  /** Called by /thank-you-report with the Stripe session id: verifies the
   *  payment, tags the buyer, emails the PDF, returns the rows to render. */
  @Post('fulfil')
  async fulfil(@Body() body: { sessionId?: string }) {
    return this.svc.fulfil(body?.sessionId || '');
  }

  /** Same as POST /fulfil, for a page that only has the id in its URL. */
  @Get('fulfil')
  async fulfilGet(@Query('session_id') sessionId?: string) {
    return this.svc.fulfil(sessionId || '');
  }
}
