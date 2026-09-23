import { Controller, Get, Header, Headers, NotFoundException, Post, Query, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import { User } from '../entities/user.entity';
import { LeaderboardFilters, View, WealthTrackerService } from './wealth-tracker.service';
import { AgeBracket } from './roster.service';

/**
 * Public reads are cached materialisations; the only computation a request
 * can start is behind the admin token. Holdings depth and the CSV export are
 * the two things a subscription unlocks (§5: "Free: leaderboards, top-5
 * holdings, last-10 strips. Premium: full holdings depth, full history,
 * filters beyond party/chamber, exports").
 */
@Controller('wealth-tracker')
export class WealthTrackerController {
  constructor(
    private readonly svc: WealthTrackerService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async isPremium(authHeader?: string): Promise<boolean> {
    const m = (authHeader || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return false;
    const payload = this.auth.verifyToken(m[1].trim());
    if (!payload) return false;
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) return false;
    try {
      return !!(await this.billing.status(user)).premium;
    } catch {
      return false;
    }
  }

  @Get('leaderboard')
  @Header('Cache-Control', 'public, max-age=300')
  leaderboard(
    @Query('view') view?: string,
    @Query('party') party?: string,
    @Query('chamber') chamber?: string,
    @Query('age') age?: string,
    @Query('activity') activity?: string,
    @Query('recency') recency?: string,
    @Query('returnBand') returnBand?: string,
    @Query('hitBand') hitBand?: string,
    @Query('includeFormer') includeFormer?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    const f: LeaderboardFilters = {
      view: (view || 'growth90d') as View,
      party: party || undefined,
      chamber: chamber || undefined,
      age: (age || undefined) as AgeBracket | undefined,
      activity: (activity || undefined) as LeaderboardFilters['activity'],
      recency: (recency || undefined) as LeaderboardFilters['recency'],
      returnBand: (returnBand || undefined) as LeaderboardFilters['returnBand'],
      hitBand: (hitBand || undefined) as LeaderboardFilters['hitBand'],
      includeFormer: includeFormer === '1' || includeFormer === 'true',
      sort: sort || undefined,
      dir: dir === 'asc' ? 'asc' : 'desc',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q: q ? String(q).slice(0, 60) : undefined,
    };
    return this.svc.leaderboard(f);
  }

  /** One member: header facts, stats, badges, holdings (top 5 free), growth curve. */
  @Get('member')
  async member(
    @Query('name') name?: string,
    @Query('bioguide') bioguide?: string,
    @Query('all') all?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const key = bioguide || name || '';
    const wantAll = all === '1';
    const premium = wantAll ? await this.isPremium(authHeader) : false;
    const data = await this.svc.member(key, { allHoldings: premium });
    if (!data) return { member: null };
    return { ...data, premium };
  }

  @Get('member/export.csv')
  async exportCsv(@Query('name') name: string | undefined, @Query('bioguide') bioguide: string | undefined, @Headers('authorization') authHeader: string | undefined, @Res() res: Response) {
    if (!(await this.isPremium(authHeader))) throw new UnauthorizedException('Exports are part of Insider Access.');
    const out = await this.svc.holdingsCsv(bioguide || name || '');
    if (!out) throw new NotFoundException('Unknown member');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.csv);
  }

  @Get('status')
  status() {
    return this.svc.summary();
  }

  /** Pull-based nightly for hosts without an in-process clock. */
  @Get('cron')
  cron() {
    return this.svc.start({ latest: true });
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  /** Full backfill: roster, every member's complete PTR record, renames, prices, reconstruction. */
  @Post('admin/backfill')
  @UseGuards(AdminTokenGuard)
  backfill() {
    return this.svc.start({ roster: true, full: true });
  }

  @Post('admin/recompute')
  @UseGuards(AdminTokenGuard)
  recompute() {
    return this.svc.start({ recomputeOnly: true });
  }

  @Post('admin/run')
  @UseGuards(AdminTokenGuard)
  run(@Query('roster') roster?: string, @Query('full') full?: string, @Query('limitSurnames') limitSurnames?: string) {
    return this.svc.start({ roster: roster === '1', full: full === '1', latest: full !== '1', limitSurnames: limitSurnames ? Number(limitSurnames) : undefined });
  }
}
