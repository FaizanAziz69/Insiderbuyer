import { Controller, Get, Header, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CqsAlertsService } from './cqs-alerts.service';
import { CqsService } from './cqs.service';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { PremiumAccessService, stripPremiumFields } from '../common/premium-access';

/** Brief v9 §8: the standing frame travels with the payload, so no surface can drop it. */
const LEGAL_FRAME =
  'Congress Quality Score measures the strength of a disclosed, lawful trading signal from ' +
  'Periodic Transaction Reports filed under the STOCK Act. Dollar figures are estimates: PTRs ' +
  'report ranges, not amounts. Nothing here implies impropriety.';

/**
 * The fields a CQS row only carries for a subscriber.
 *
 * Brief v9 §6 splits this board: the GRADE is free, the 0-100 number is paid,
 * and so is the evidence that produces it — the eight component scores, the
 * committee/contract legs, the since-filing return and the graded buyer list
 * (which is Brief v7's paid dataset reached through a different door).
 *
 * Free, deliberately: ticker, company, grade, the member and party counts, the
 * estimated dollars, the largest band, buy/sell counts, the last buy date,
 * sector/cap/price, the Insider Score (§6 lists it as its own free column) and
 * the trade ROI the board already showed without a PRO pill. That is enough
 * for the page to mean something logged out, and it is what Googlebot indexes.
 */
const CQS_PREMIUM_FIELDS = [
  'cqs',
  'c1ClusterBreadth',
  'c2PositionSize',
  'c3CommitteeInfluence',
  'c4ContractAlignment',
  'c5BuyerTrackRecord',
  'c6RelativeConviction',
  'c7Freshness',
  'c8NetDirection',
  'multiplierInsiderOverlap',
  'multiplierLegislativeCatalyst',
  'multiplierContrarianEntry',
  'multiplierLiquidityNorm',
  'multiplierFilingLag',
  'multipliersUnavailable',
  'committees',
  'highestRole',
  'contractValue12m',
  'contractCount12m',
  'topAgency',
  'bestCtsScore',
  'sinceFilingRoiPct',
  'buyers',
] as const;

/**
 * The bubble payload's paid half.
 *
 * The bubble rows are a projection, not CQS rows, so they cannot reuse the list
 * above verbatim — most of those keys are simply not on a bubble. What survives
 * the projection and is still paid is the one thing §6 charges for: the 0-100
 * number. Grade, ring, sector, dollars, counts and the Insider Score are free
 * on the board and stay free here.
 *
 * `overlap` stays free deliberately: it is a flag, not the multiplier, and the
 * public leaderboard already exposes exactly this bit through its `overlap=1`
 * filter. Hiding it here would gate nothing that is not already reachable.
 */
const CQS_BUBBLE_PREMIUM_FIELDS = ['cqs'] as const;

/**
 * These responses now vary by Authorization, so they must never sit in a
 * shared cache — a `public, max-age=300` hit would hand one subscriber's
 * payload to the next guest through it. Entitled reads go `private`; guest
 * reads keep a short shared TTL because that payload IS the public one.
 */
function setEntitlementCache(res: Response, entitled: boolean): void {
  res.setHeader('Vary', 'Authorization');
  res.setHeader(
    'Cache-Control',
    entitled ? 'private, no-store' : 'public, max-age=300',
  );
}

@Controller('cqs')
export class CqsController {
  constructor(
    private readonly cqsService: CqsService,
    private readonly access: PremiumAccessService,
      private readonly alerts: CqsAlertsService,
  ) {}

  @Get('leaderboard')
  async leaderboard(
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sector') sector?: string,
    @Query('party') party?: string,
    @Query('grade') grade?: string,
    @Query('minScore') minScore?: string,
    @Query('overlap') overlap?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.cqsService.getLeaderboard({
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
      sector,
      party,
      grade,
      minScore: minScore ? Number(minScore) : undefined,
      overlapOnly: overlap === '1' || overlap === 'true',
      search,
    });
    const entitled = await this.access.isPremium(authHeader);
    setEntitlementCache(res, entitled);
    return {
      ...result,
      rows: stripPremiumFields(result.rows as any[], CQS_PREMIUM_FIELDS, entitled),
      premium: entitled,
      windowDays: 90,
      frame: LEGAL_FRAME,
    };
  }

  /**
   * The "Stocks" mode of /congress-bubbles. PUBLIC — no guard — because the
   * bubble field is what a logged-out visitor is meant to see and what
   * Googlebot indexes.
   *
   * The paygate is the leaderboard's, unchanged: the GRADE, the ring, the
   * estimated dollars that set the bubble size and the member counts are free;
   * the 0-100 number is not, so `cqs` goes through `stripPremiumFields` and is
   * REMOVED (not zeroed) for guests. `topBuyers` carries name/party/photo only
   * — never the grade or the per-member dollars that make `buyers` a paid
   * field on the board.
   *
   * `@Header` states the guest cache, then `setEntitlementCache` overrides it:
   * once a response varies by Authorization, a shared `public, max-age=300`
   * entry would hand a subscriber's payload to the next guest through it.
   */
  @Get('bubbles')
  @Header('Cache-Control', 'public, max-age=300')
  async bubbles(
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader?: string,
    @Query('period') period?: string,
  ) {
    const result = await this.cqsService.bubbles(period);
    const entitled = await this.access.isPremium(authHeader);
    setEntitlementCache(res, entitled);
    return {
      ...result,
      bubbles: stripPremiumFields(
        result.bubbles as any[],
        CQS_BUBBLE_PREMIUM_FIELDS,
        entitled,
      ),
    };
  }

  @Get('ticker/:ticker')
  async ticker(
    @Param('ticker') ticker: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader?: string,
  ) {
    const score = await this.cqsService.getByTicker(ticker);
    const entitled = await this.access.isPremium(authHeader);
    setEntitlementCache(res, entitled);
    return {
      ticker: ticker.toUpperCase(),
      // One row through the same shaper, so the stock-page panel and the board
      // can never disagree about what a subscription buys.
      score: score
        ? stripPremiumFields([score as any], CQS_PREMIUM_FIELDS, entitled)[0]
        : score,
      premium: entitled,
      frame: LEGAL_FRAME,
    };
  }

  @Get('status')
  @UseGuards(AdminTokenGuard)
  async status() {
    return this.cqsService.status();
  }

  /** §7 alerts. `send=0` previews the transitions without emailing anyone. */
  @Post('admin/alerts')
  @UseGuards(AdminTokenGuard)
  async runAlerts(@Query('send') send?: string) {
    return this.alerts.run({ send: send !== '0' });
  }

  @Post('admin/recalculate')
  @UseGuards(AdminTokenGuard)
  async recalculate(@Query('asOf') asOf?: string) {
    return this.cqsService.recalculateAll(asOf);
  }
}
