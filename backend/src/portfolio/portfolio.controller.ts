import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { User } from '../entities/user.entity';
import { BillingService } from '../billing/billing.service';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { PortfolioService } from './portfolio.service';

function bearer(header?: string): string {
  if (!header) return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/**
 * My Portfolio (Round-2 brief, Section 3). Everything here is user-scoped:
 * holdings live against an account, because the SMS alert engine has to know
 * who owns what.
 */
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly billing: BillingService,
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async requireUser(authHeader?: string): Promise<User> {
    const payload = this.auth.verifyToken(bearer(authHeader));
    if (!payload) throw new UnauthorizedException('Sign in to use your portfolio.');
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Account not found.');
    return user;
  }

  /** Holdings + scores. Scores are null/locked until the tier is live. */
  @Get()
  async list(@Headers('authorization') auth?: string) {
    return this.portfolio.list(await this.requireUser(auth));
  }

  @Get('status')
  async status(@Headers('authorization') auth?: string) {
    return this.portfolio.status(await this.requireUser(auth));
  }

  @Post()
  async add(@Body() body: { ticker?: string }, @Headers('authorization') auth?: string) {
    return this.portfolio.add(await this.requireUser(auth), body?.ticker || '');
  }

  @Delete(':ticker')
  async remove(@Param('ticker') ticker: string, @Headers('authorization') auth?: string) {
    return this.portfolio.remove(await this.requireUser(auth), ticker);
  }

  /** $19/month checkout — a separate Stripe subscription from premium. */
  @Post('checkout')
  async checkout(@Headers('authorization') auth?: string) {
    return this.billing.createPortfolioCheckout(await this.requireUser(auth));
  }

  /** The phone-collection flow the brief triggers on purchase: store the
   *  number, then send the confirmation SMS. */
  @Post('phone')
  async phone(@Body() body: { phone?: string }, @Headers('authorization') auth?: string) {
    return this.portfolio.savePhone(await this.requireUser(auth), body?.phone || '');
  }

  /** Manual sweep of the alert engine (the hourly cron does this on its own). */
  @Post('alerts/run')
  @UseGuards(AdminTokenGuard)
  async runAlerts() {
    return this.portfolio.runAlerts();
  }
}
