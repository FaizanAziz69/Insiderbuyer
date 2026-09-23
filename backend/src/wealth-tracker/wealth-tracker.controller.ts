import { Body, Controller, Get, Header, Headers, NotFoundException, Param, Post, Query, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import { User } from '../entities/user.entity';
import { LeaderboardFilters, View, WealthTrackerService } from './wealth-tracker.service';
import { AgeBracket } from './roster.service';
import { Last10Service, Last10Type } from './last10.service';
import { UnifiedService, UnifiedType } from './unified.service';
import { HouseArchiveService } from './house-archive.service';
import { TrackerVerificationService } from './verification.service';
import { FilingAlertsService } from './filing-alerts.service';

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
    private readonly last10: Last10Service,
    private readonly unified: UnifiedService,
    private readonly houseArchive: HouseArchiveService,
    private readonly verification: TrackerVerificationService,
    private readonly alerts: FilingAlertsService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** The signed-in user's id, or null. Follows are per-account, not per-email. */
  private async userIdFrom(authHeader?: string): Promise<string | null> {
    const m = (authHeader || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const payload = this.auth.verifyToken(m[1].trim());
    return payload?.sub || null;
  }

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

  /** Build 2: the ten most recent disclosed trades for one person, any insider type. */
  @Get('last10')
  @Header('Cache-Control', 'public, max-age=300')
  async lastTen(@Query('type') type?: string, @Query('key') key?: string) {
    const t = (type === 'insider' || type === 'investor' ? type : 'congress') as Last10Type;
    const data = await this.last10.get(t, String(key || ''));
    return data || { type: t, key: key || '', subject: null, items: [], summary: null };
  }

  /** Build 2, stock-page variant: recent insider and congressional trades in one ticker. */
  @Get('last10/ticker/:ticker')
  @Header('Cache-Control', 'public, max-age=300')
  lastTenTicker(@Param('ticker') ticker: string) {
    return this.last10.forTicker(ticker);
  }

  /** Build 3: one card anatomy for every insider type, graded within type. */
  @Get('unified')
  @Header('Cache-Control', 'public, max-age=300')
  unifiedList(@Query('type') type?: string, @Query('sort') sort?: string, @Query('category') category?: string, @Query('limit') limit?: string) {
    const t = (['corporate', 'congress', 'investor'].includes(String(type)) ? type : 'all') as 'all' | UnifiedType;
    const s = (sort === 'performance' || sort === 'active' ? sort : 'popular') as 'popular' | 'performance' | 'active';
    const cat = ['growth', 'value', 'short', 'longterm'].includes(String(category)) ? String(category) : undefined;
    return this.unified.list({ type: t, sort: s, category: cat, limit: limit ? Number(limit) : 200 });
  }

  @Post('admin/rebuild-unified')
  @UseGuards(AdminTokenGuard)
  rebuildUnified() {
    return this.unified.rebuild();
  }

  /** What the committed House Clerk archive holds (no database access). */
  @Get('house-archive')
  houseArchiveStatus() {
    return this.houseArchive.status();
  }

  /** Load the pre-2017 House record the vendor does not carry. Idempotent. */
  @Post('admin/load-house-archive')
  @UseGuards(AdminTokenGuard)
  loadHouseArchive(@Query('years') years?: string) {
    const list = String(years || '')
      .split(',')
      .map((y) => Number(y.trim()))
      .filter((y) => Number.isFinite(y) && y > 2000);
    return this.houseArchive.load({ years: list.length ? list : undefined });
  }

  // ── Stage 5 verification (§5) ────────────────────────────────────────

  /** The correction record is public: §5 makes corrections append-only, and
   *  a correction nobody can read is not a correction. */
  @Get('corrections')
  @Header('Cache-Control', 'public, max-age=300')
  corrections(@Query('limit') limit?: string, @Query('bioguide') bioguide?: string) {
    return this.verification.corrections(limit ? Number(limit) : 100, bioguide);
  }

  @Get('verification/status')
  verificationStatus() {
    return this.verification.status();
  }

  @Post('admin/verify')
  @UseGuards(AdminTokenGuard)
  verify(@Query('limit') limit?: string, @Query('bioguide') bioguide?: string) {
    return bioguide ? this.verification.verifyMember(bioguide) : this.verification.verify(limit ? Number(limit) : 12);
  }

  // ── Filing alerts (§5, Premium) ──────────────────────────────────────

  @Get('follows')
  async follows(@Headers('authorization') authHeader?: string) {
    const userId = await this.userIdFrom(authHeader);
    if (!userId) return { following: [] };
    return { following: await this.alerts.following(userId) };
  }

  @Post('follows')
  async followMember(@Body() body: { bioguide: string; follow?: boolean }, @Headers('authorization') authHeader?: string) {
    const userId = await this.userIdFrom(authHeader);
    if (!userId) throw new UnauthorizedException('Sign in to follow a member.');
    return body.follow === false
      ? this.alerts.unfollow(userId, body.bioguide)
      : this.alerts.follow(userId, body.bioguide);
  }

  @Post('admin/dispatch-alerts')
  @UseGuards(AdminTokenGuard)
  dispatchAlerts(@Query('dryRun') dryRun?: string, @Query('days') days?: string) {
    return this.alerts.dispatch({ dryRun: dryRun === '1', lookbackDays: days ? Number(days) : undefined });
  }

  @Get('alerts/status')
  alertsStatus() {
    return this.alerts.status();
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
